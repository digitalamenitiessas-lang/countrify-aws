'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  callIAdminNextReceiptNumberInPostgres,
  deleteBankMovementInPostgres,
  getCashAccountFromPostgres,
  getLiquidationItemRunFromPostgres,
  getPaymentForVoidFromPostgres,
  insertBankMovementInPostgres,
  insertCollectionPaymentInPostgres,
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
