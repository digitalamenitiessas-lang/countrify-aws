'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { pgQuery } from '@/lib/db/postgres'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  applyPaymentToLedgerInPostgres,
  assertProrataNotOver100,
  callIAdminNextReceiptNumberInPostgres,
  deleteBankMovementInPostgres,
  getCashAccountFromPostgres,
  getLiquidationItemRunFromPostgres,
  getPaymentForVoidFromPostgres,
  insertBankMovementInPostgres,
  insertCollectionPaymentInPostgres,
  reversePaymentApplicationsInLedgerInPostgres,
  voidPaymentInPostgres,
} from '@/lib/db/iadmin-writes'

const registerSchema = z.object({
  liquidationItemId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
  amount: z.number().positive(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueLabel: z.string().trim().max(40).optional(),
  surchargeAmount: z.number().min(0).optional().default(0),
  method: z.string().trim().max(40).optional(),
  reference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
})

export async function registerCollection(input: z.input<typeof registerSchema>) {
  const parsed = registerSchema.parse(input)

  const item = await getLiquidationItemRunFromPostgres(parsed.liquidationItemId)
  if (!item) throw new Error('Item de liquidacion no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'collections.register',
    administrationId: item.administration_id,
  })

  await assertProrataNotOver100(item.managed_property_id)

  const account = await getCashAccountFromPostgres(parsed.cashAccountId)
  if (!account) throw new Error('Cuenta no encontrada')
  if (account.managed_property_id !== item.managed_property_id) {
    throw new Error('La cuenta no pertenece al consorcio del item')
  }

  const movement = await insertBankMovementInPostgres({
    administrationId: item.administration_id,
    managedPropertyId: item.managed_property_id,
    cashAccountId: parsed.cashAccountId,
    movementDate: parsed.paidAt,
    description: 'Cobranza expensas',
    amount: parsed.amount,
    externalRef: parsed.reference ?? null,
    movementKind: 'collection',
    createdBy: profile.id,
  })

  const receiptNumber = await callIAdminNextReceiptNumberInPostgres(item.administration_id)

  let payment: { id: string; receipt_number: string }
  try {
    payment = await insertCollectionPaymentInPostgres({
      administrationId: item.administration_id,
      managedPropertyId: item.managed_property_id,
      liquidationRunId: item.liquidation_run_id,
      liquidationItemId: parsed.liquidationItemId,
      unitId: item.unit_id,
      cashAccountId: parsed.cashAccountId,
      bankMovementId: movement.id,
      amount: parsed.amount,
      surchargeAmount: parsed.surchargeAmount ?? 0,
      paidAt: parsed.paidAt,
      method: parsed.method ?? null,
      reference: parsed.reference ?? null,
      receiptNumber,
      dueLabel: parsed.dueLabel ?? null,
      notes: parsed.notes ?? null,
      createdBy: profile.id,
    })
  } catch (error) {
    await deleteBankMovementInPostgres(movement.id)
    throw error instanceof Error ? error : new Error('No se pudo registrar el pago')
  }

  await insertIAdminAuditLogInPostgres({
    administrationId: item.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_payments',
    entityId: payment.id,
    action: 'payment.registered',
    metadata: {
      amount: parsed.amount,
      receipt_number: payment.receipt_number,
      item_id: parsed.liquidationItemId,
    },
  })

  await applyPaymentToLedgerInPostgres({
    paymentId: payment.id,
    administrationId: item.administration_id,
    managedPropertyId: item.managed_property_id,
    unitId: item.unit_id,
    amount: parsed.amount,
    paidAt: parsed.paidAt,
    createdBy: profile.id,
  })

  revalidatePath(`/iadmin/liquidaciones/${item.liquidation_run_id}`)
  revalidatePath(`/iadmin/consorcios/${item.managed_property_id}`)
  revalidatePath(`/iadmin/consorcios/${item.managed_property_id}/cuentas`)
  revalidatePath(`/iadmin/cobranzas`)

  return { id: payment.id, receiptNumber: payment.receipt_number }
}

const voidSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
})

export async function voidCollection(input: z.input<typeof voidSchema>) {
  const parsed = voidSchema.parse(input)

  const payment = await getPaymentForVoidFromPostgres(parsed.paymentId)
  if (!payment) throw new Error('Pago no encontrado')
  if (payment.is_void) throw new Error('El pago ya esta anulado')

  const { profile } = await requireIAdmin({
    capability: 'collections.void',
    administrationId: payment.administration_id,
  })

  await voidPaymentInPostgres({
    paymentId: parsed.paymentId,
    voidedBy: profile.id,
    reason: parsed.reason,
  })

  await reversePaymentApplicationsInLedgerInPostgres({
    paymentId: parsed.paymentId,
    actorProfileId: profile.id,
    reason: parsed.reason,
  })

  if (payment.bank_movement_id) {
    await deleteBankMovementInPostgres(payment.bank_movement_id)
  }

  await insertIAdminAuditLogInPostgres({
    administrationId: payment.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_payments',
    entityId: parsed.paymentId,
    action: 'payment.voided',
    metadata: { reason: parsed.reason },
  })

  if (payment.liquidation_run_id) {
    revalidatePath(`/iadmin/liquidaciones/${payment.liquidation_run_id}`)
  }
  if (payment.managed_property_id) {
    revalidatePath(`/iadmin/consorcios/${payment.managed_property_id}`)
    revalidatePath(`/iadmin/consorcios/${payment.managed_property_id}/cuentas`)
  }
  revalidatePath(`/iadmin/cobranzas`)
}

// ----------------------------------------------------------------------------
// Payment claims: el vecino reporta que pagó, el admin valida o rechaza.
// ----------------------------------------------------------------------------

interface ClaimRow {
  id: string
  administration_id: string
  managed_property_id: string
  unit_id: string
  liquidation_item_id: string | null
  reporter_profile_id: string
  amount: string
  paid_at_claimed: string
  method: string | null
  reference: string | null
  notes: string | null
  document_object_key: string | null
  status: 'pending' | 'validated' | 'rejected'
}

const validateClaimSchema = z.object({
  claimId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
})

export async function validatePaymentClaim(input: z.input<typeof validateClaimSchema>) {
  const parsed = validateClaimSchema.parse(input)

  const claimRes = await pgQuery<ClaimRow>(
    `select id, administration_id, managed_property_id, unit_id, liquidation_item_id,
            reporter_profile_id, amount::text as amount, paid_at_claimed::text as paid_at_claimed,
            method, reference, notes, document_object_key, status::text as status
       from countrify.iadmin_payment_claims
      where id = $1
      limit 1`,
    [parsed.claimId],
  )
  const claim = claimRes.rows[0]
  if (!claim) throw new Error('Reporte de pago no encontrado')
  if (claim.status !== 'pending') throw new Error('Este reporte ya fue procesado')
  if (!claim.liquidation_item_id) {
    throw new Error('El reporte no apunta a una liquidación específica — registralo manualmente')
  }

  const item = await getLiquidationItemRunFromPostgres(claim.liquidation_item_id)
  if (!item) throw new Error('Item de liquidación no encontrado')
  if (item.administration_id !== claim.administration_id) {
    throw new Error('El item no pertenece a la administración del reporte')
  }

  const { profile } = await requireIAdmin({
    capability: 'collections.validate_claims',
    administrationId: claim.administration_id,
  })

  await assertProrataNotOver100(claim.managed_property_id)

  const account = await getCashAccountFromPostgres(parsed.cashAccountId)
  if (!account) throw new Error('Cuenta no encontrada')
  if (account.managed_property_id !== claim.managed_property_id) {
    throw new Error('La cuenta no pertenece al consorcio del reporte')
  }

  const amount = Number(claim.amount)

  const movement = await insertBankMovementInPostgres({
    administrationId: claim.administration_id,
    managedPropertyId: claim.managed_property_id,
    cashAccountId: parsed.cashAccountId,
    movementDate: claim.paid_at_claimed,
    description: 'Cobranza expensas (reporte vecino validado)',
    amount,
    externalRef: claim.reference,
    movementKind: 'collection',
    createdBy: profile.id,
  })

  const receiptNumber = await callIAdminNextReceiptNumberInPostgres(claim.administration_id)

  let payment: { id: string; receipt_number: string }
  try {
    payment = await insertCollectionPaymentInPostgres({
      administrationId: claim.administration_id,
      managedPropertyId: claim.managed_property_id,
      liquidationRunId: item.liquidation_run_id,
      liquidationItemId: claim.liquidation_item_id,
      unitId: claim.unit_id,
      cashAccountId: parsed.cashAccountId,
      bankMovementId: movement.id,
      amount,
      surchargeAmount: 0,
      paidAt: claim.paid_at_claimed,
      method: claim.method,
      reference: claim.reference,
      receiptNumber,
      dueLabel: null,
      notes: claim.notes,
      createdBy: profile.id,
    })
  } catch (error) {
    await deleteBankMovementInPostgres(movement.id)
    throw error instanceof Error ? error : new Error('No se pudo registrar el pago')
  }

  await applyPaymentToLedgerInPostgres({
    paymentId: payment.id,
    administrationId: claim.administration_id,
    managedPropertyId: claim.managed_property_id,
    unitId: claim.unit_id,
    amount,
    paidAt: claim.paid_at_claimed,
    createdBy: profile.id,
  })

  await pgQuery(
    `update countrify.iadmin_payment_claims
        set status = 'validated', validated_by = $2, validated_at = now(), payment_id = $3
      where id = $1`,
    [claim.id, profile.id, payment.id],
  )

  await insertIAdminAuditLogInPostgres({
    administrationId: claim.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_payment_claims',
    entityId: claim.id,
    action: 'payment_claim.validated',
    metadata: { payment_id: payment.id, amount, receipt_number: payment.receipt_number },
  })

  revalidatePath('/iadmin/cobranzas')
  revalidatePath(`/iadmin/liquidaciones/${item.liquidation_run_id}`)
  return { paymentId: payment.id, receiptNumber: payment.receipt_number }
}

const rejectClaimSchema = z.object({
  claimId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
})

export async function rejectPaymentClaim(input: z.input<typeof rejectClaimSchema>) {
  const parsed = rejectClaimSchema.parse(input)

  const claimRes = await pgQuery<ClaimRow>(
    `select id, administration_id, managed_property_id, unit_id, liquidation_item_id,
            reporter_profile_id, amount::text as amount, paid_at_claimed::text as paid_at_claimed,
            method, reference, notes, document_object_key, status::text as status
       from countrify.iadmin_payment_claims
      where id = $1
      limit 1`,
    [parsed.claimId],
  )
  const claim = claimRes.rows[0]
  if (!claim) throw new Error('Reporte no encontrado')
  if (claim.status !== 'pending') throw new Error('Este reporte ya fue procesado')

  const { profile } = await requireIAdmin({
    capability: 'collections.validate_claims',
    administrationId: claim.administration_id,
  })

  await pgQuery(
    `update countrify.iadmin_payment_claims
        set status = 'rejected', validated_by = $2, validated_at = now(), rejected_reason = $3
      where id = $1`,
    [claim.id, profile.id, parsed.reason],
  )

  await insertIAdminAuditLogInPostgres({
    administrationId: claim.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_payment_claims',
    entityId: claim.id,
    action: 'payment_claim.rejected',
    metadata: { reason: parsed.reason },
  })

  revalidatePath('/iadmin/cobranzas')
}
