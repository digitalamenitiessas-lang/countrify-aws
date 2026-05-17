'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminUnitAccountStatement } from '@/lib/data'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  bulkInsertLiquidationItemsInPostgres,
  bulkInsertShareTokensInPostgres,
  bulkRevokeShareTokensInPostgres,
  callIAdminNextReceiptNumberInPostgres,
  deleteBankMovementInPostgres,
  deleteExpenseFromPostgres,
  deleteLiquidationItemsForRunInPostgres,
  ensureAccountingPeriodInPostgres,
  findExpenseInPeriodByProviderFromPostgres,
  findProviderByNameWithRecurringFromPostgres,
  getAccountingPeriodIdAndStatusFromPostgres,
  getFirstActiveCashAccountFromPostgres,
  getLiquidationItemByRunUnitFromPostgres,
  getLiquidationRunByPeriodFromPostgres,
  getManagedPropertyAdminIdFromPostgres,
  getManagedPropertyForEmitFromPostgres,
  getProviderNameAndDefaultDescFromPostgres,
  insertBankMovementInPostgres,
  insertCollectionPaymentInPostgres,
  insertExpenseInPostgres,
  insertProviderRecurringFromPostgres,
  listActiveUnitsWithHoldersForEmitFromPostgres,
  listImputedExpensesAmountsByPeriodFromPostgres,
  listLiquidationItemsByRunFromPostgres,
  listLiveShareTokensByItemsFromPostgres,
  listPriorRunItemsForEmitFromPostgres,
  setProviderRecurringInPostgres,
  sumLivePaymentsByItemIdsFromPostgres,
  updateExpenseAmountInPostgres,
  upsertIssuedLiquidationRunInPostgres,
} from '@/lib/db/iadmin-writes'
import type { IAdminExpenseStatus, IAdminUnitAccountStatement } from '@/lib/types'

const cellSchema = z.object({
  propertyId: z.string().uuid(),
  providerId: z.string().uuid().nullable(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number().nullable(),
  description: z.string().trim().max(240).optional(),
  expenseKind: z.enum(['ordinaria', 'extraordinaria']).optional().default('ordinaria'),
})

export async function upsertMonthlyCell(
  input: z.input<typeof cellSchema>,
): Promise<{ action: 'created' | 'updated' | 'deleted' | 'noop'; expenseId: string | null }> {
  const parsed = cellSchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile, context } = await requireIAdmin({
    capability: 'expenses.create',
    administrationId: property.administration_id,
  })

  const existingPeriod = await getAccountingPeriodIdAndStatusFromPostgres({
    managedPropertyId: parsed.propertyId,
    periodYear: parsed.year,
    periodMonth: parsed.month,
  })

  let periodId: string
  let periodStatus: string
  if (existingPeriod) {
    periodId = existingPeriod.id
    periodStatus = existingPeriod.status
  } else {
    const created = await ensureAccountingPeriodInPostgres({
      managedPropertyId: parsed.propertyId,
      periodYear: parsed.year,
      periodMonth: parsed.month,
    })
    periodId = created.id
    periodStatus = 'open'
  }

  if (periodStatus === 'closed') {
    throw new Error('El período del mes está cerrado. Reabrilo desde Liquidaciones para editar.')
  }

  const existing = await findExpenseInPeriodByProviderFromPostgres({
    managedPropertyId: parsed.propertyId,
    accountingPeriodId: periodId,
    providerId: parsed.providerId,
  })

  const wantsDelete = parsed.amount === null || parsed.amount === 0

  if (wantsDelete && existing) {
    await deleteExpenseFromPostgres(existing.id)
    await insertIAdminAuditLogInPostgres({
      administrationId: property.administration_id,
      actorProfileId: profile.id,
      entityType: 'iadmin_expenses',
      entityId: existing.id,
      action: 'expense.deleted_from_planilla',
      metadata: { period: `${parsed.year}-${parsed.month}` },
    })
    revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
    return { action: 'deleted', expenseId: null }
  }

  if (wantsDelete && !existing) {
    return { action: 'noop', expenseId: null }
  }

  const amount = parsed.amount as number

  const canApprove =
    context.isSuperAdmin ||
    (context.memberships
      .find((m) => m.administration.id === property.administration_id)
      ?.capabilities.includes('expenses.approve') ?? false)
  const targetStatus: IAdminExpenseStatus = canApprove ? 'imputed' : 'pending_review'

  let description = parsed.description?.trim() ?? ''
  if (!description) {
    if (parsed.providerId) {
      const provider = await getProviderNameAndDefaultDescFromPostgres(parsed.providerId)
      description = (provider?.default_description?.trim() || provider?.name || 'Gasto') + ` - ${String(parsed.month).padStart(2, '0')}/${parsed.year}`
    } else {
      description = `Gasto - ${String(parsed.month).padStart(2, '0')}/${parsed.year}`
    }
  }

  if (existing) {
    await updateExpenseAmountInPostgres({
      expenseId: existing.id,
      amount,
      description,
      expenseKind: parsed.expenseKind ?? 'ordinaria',
      status: targetStatus,
      approvedBy: profile.id,
      setApprovedTimestamp: targetStatus === 'imputed' && existing.status !== 'imputed',
    })
    revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
    return { action: 'updated', expenseId: existing.id }
  }

  const issuedAt = new Date(parsed.year, parsed.month - 1, 5).toISOString().slice(0, 10)
  const inserted = await insertExpenseInPostgres({
    administrationId: property.administration_id,
    managedPropertyId: parsed.propertyId,
    accountingPeriodId: periodId,
    providerId: parsed.providerId,
    category: null,
    description,
    amount,
    currency: 'ARS',
    issuedAt,
    dueAt: null,
    status: targetStatus,
    expenseKind: parsed.expenseKind ?? 'ordinaria',
    createdBy: profile.id,
    approvedBy: targetStatus === 'imputed' ? profile.id : null,
  })

  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
  return { action: 'created', expenseId: inserted.id }
}

const addRubroSchema = z.object({
  administrationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(60).optional(),
  recurringKind: z.enum(['ordinaria', 'extraordinaria']).optional().default('ordinaria'),
})

export async function addRecurringRubro(
  input: z.input<typeof addRubroSchema>,
): Promise<{ providerId: string }> {
  const parsed = addRubroSchema.parse(input)
  await requireIAdmin({
    capability: 'providers.manage',
    administrationId: parsed.administrationId,
  })

  const existing = await findProviderByNameWithRecurringFromPostgres({
    administrationId: parsed.administrationId,
    name: parsed.name.trim(),
  })

  if (existing) {
    if (!existing.is_recurring) {
      await setProviderRecurringInPostgres({
        providerId: existing.id,
        isRecurring: true,
        recurringKind: parsed.recurringKind ?? 'ordinaria',
      })
    }
    revalidatePath('/iadmin/consorcios', 'layout')
    return { providerId: existing.id }
  }

  const created = await insertProviderRecurringFromPostgres({
    administrationId: parsed.administrationId,
    name: parsed.name.trim(),
    category: parsed.category ?? null,
    recurringKind: parsed.recurringKind ?? 'ordinaria',
  })

  revalidatePath('/iadmin/consorcios', 'layout')
  return { providerId: created.id }
}

const emitSchema = z.object({
  propertyId: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
})

export type NeighborMessage = {
  itemId: string
  unitCode: string
  holderName: string | null
  holderPhone: string | null
  holderEmail: string | null
  amountToPay: number
  subtotal: number
  message: string
  shareUrl: string | null
  whatsappHref: string | null
}

export type EmitAndNotifyResult = {
  runId: string
  periodLabel: string
  liquidated: number
  neighbors: NeighborMessage[]
}

function randomToken(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

const quickPaySchema = z.object({
  propertyId: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  unitId: z.string().uuid(),
  amount: z.number().positive(),
})

export async function quickPayFromMesa(
  input: z.input<typeof quickPaySchema>,
): Promise<{ receiptNumber: string }> {
  const parsed = quickPaySchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'collections.register',
    administrationId: property.administration_id,
  })

  const period = await getAccountingPeriodIdAndStatusFromPostgres({
    managedPropertyId: parsed.propertyId,
    periodYear: parsed.year,
    periodMonth: parsed.month,
  })
  if (!period) throw new Error('Período no encontrado')

  const run = await getLiquidationRunByPeriodFromPostgres({
    managedPropertyId: parsed.propertyId,
    accountingPeriodId: period.id,
  })
  if (!run) throw new Error('No hay liquidación emitida para este mes')

  const item = await getLiquidationItemByRunUnitFromPostgres({
    runId: run.id,
    unitId: parsed.unitId,
  })
  if (!item) throw new Error('Unidad sin item en la liquidación')

  const cashAccount = await getFirstActiveCashAccountFromPostgres(parsed.propertyId)
  if (!cashAccount) throw new Error('Configurá una cuenta bancaria antes de cobrar')

  const today = new Date().toISOString().slice(0, 10)
  const movement = await insertBankMovementInPostgres({
    administrationId: property.administration_id,
    managedPropertyId: parsed.propertyId,
    cashAccountId: cashAccount.id,
    movementDate: today,
    description: 'Cobranza',
    amount: parsed.amount,
    externalRef: null,
    movementKind: 'collection',
    createdBy: profile.id,
  })

  const receiptNumber = await callIAdminNextReceiptNumberInPostgres(property.administration_id)

  try {
    await insertCollectionPaymentInPostgres({
      administrationId: property.administration_id,
      managedPropertyId: parsed.propertyId,
      liquidationRunId: run.id,
      liquidationItemId: item.id,
      unitId: parsed.unitId,
      cashAccountId: cashAccount.id,
      bankMovementId: movement.id,
      amount: parsed.amount,
      surchargeAmount: 0,
      paidAt: today,
      method: 'transferencia',
      reference: null,
      receiptNumber,
      dueLabel: null,
      notes: null,
      createdBy: profile.id,
    })
  } catch (error) {
    await deleteBankMovementInPostgres(movement.id)
    throw error
  }

  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
  return { receiptNumber }
}

export async function emitAndNotify(
  input: z.input<typeof emitSchema>,
): Promise<EmitAndNotifyResult> {
  const parsed = emitSchema.parse(input)

  const property = await getManagedPropertyForEmitFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'liquidations.create',
    administrationId: property.administration_id,
  })

  const period = await getAccountingPeriodIdAndStatusFromPostgres({
    managedPropertyId: parsed.propertyId,
    periodYear: parsed.year,
    periodMonth: parsed.month,
  })
  if (!period) throw new Error('El período no existe. Cargá al menos un gasto primero.')

  const imputedExpenses = await listImputedExpensesAmountsByPeriodFromPostgres({
    managedPropertyId: parsed.propertyId,
    accountingPeriodId: period.id,
  })
  if (imputedExpenses.length === 0) {
    throw new Error('No hay gastos imputados este mes. Cargá al menos uno en la planilla.')
  }

  const ordinaryTotal = imputedExpenses
    .filter((e) => (e.expense_kind ?? 'ordinaria') !== 'extraordinaria')
    .reduce((s, e) => s + Number(e.amount), 0)
  const extraordinaryTotal = imputedExpenses
    .filter((e) => e.expense_kind === 'extraordinaria')
    .reduce((s, e) => s + Number(e.amount), 0)
  const totalExpenses = Math.round((ordinaryTotal + extraordinaryTotal) * 100) / 100

  const units = await listActiveUnitsWithHoldersForEmitFromPostgres(parsed.propertyId)
  const eligibleUnits = units.filter((u) => u.prorata_coefficient !== null)
  if (eligibleUnits.length === 0) {
    throw new Error('No hay unidades activas con alícuota definida.')
  }

  const previousBalanceByUnit = new Map<string, number>()
  const priorItems = await listPriorRunItemsForEmitFromPostgres({
    managedPropertyId: parsed.propertyId,
    excludePeriodId: period.id,
  })
  if (priorItems.length > 0) {
    const itemIds = priorItems.map((it) => it.item_id)
    const paidByItem = await sumLivePaymentsByItemIdsFromPostgres(itemIds)
    for (const it of priorItems) {
      const sub =
        Number(it.ordinary_amount ?? 0) +
        Number(it.extraordinary_amount ?? 0) +
        Number(it.previous_balance ?? 0)
      const paid = paidByItem.get(it.item_id) ?? 0
      const debt = Math.max(0, Math.round((sub - paid) * 100) / 100)
      if (debt > 0) previousBalanceByUnit.set(it.unit_id, debt)
    }
  }
  const totalPreviousBalance = Array.from(previousBalanceByUnit.values()).reduce((s, v) => s + v, 0)

  const nextMonth = parsed.month === 12 ? 1 : parsed.month + 1
  const nextYear = parsed.month === 12 ? parsed.year + 1 : parsed.year
  const mm = String(nextMonth).padStart(2, '0')
  const dueDates = [
    { label: '1er vencimiento', date: `${nextYear}-${mm}-10`, surcharge_pct: 0 },
    { label: '2do vencimiento', date: `${nextYear}-${mm}-25`, surcharge_pct: 3 },
  ]

  const run = await upsertIssuedLiquidationRunInPostgres({
    administrationId: property.administration_id,
    managedPropertyId: parsed.propertyId,
    accountingPeriodId: period.id,
    totalExpenses,
    ordinaryTotal: Math.round(ordinaryTotal * 100) / 100,
    extraordinaryTotal: Math.round(extraordinaryTotal * 100) / 100,
    previousBalance: Math.round(totalPreviousBalance * 100) / 100,
    dueDates,
    totalUnits: eligibleUnits.length,
    generatedBy: profile.id,
    issuedBy: profile.id,
  })

  await deleteLiquidationItemsForRunInPostgres(run.id)
  const itemsToInsert = eligibleUnits.map((u) => {
    const prorata = Number(u.prorata_coefficient)
    const ordinary = Math.round(ordinaryTotal * prorata * 100) / 100
    const extra = Math.round(extraordinaryTotal * prorata * 100) / 100
    const prev = previousBalanceByUnit.get(u.id) ?? 0
    return {
      liquidation_run_id: run.id,
      unit_id: u.id,
      prorata_coefficient: prorata,
      amount: ordinary,
      ordinary_amount: ordinary,
      extraordinary_amount: extra,
      previous_balance: prev,
    }
  })
  await bulkInsertLiquidationItemsInPostgres(itemsToInsert)

  const newItems = await listLiquidationItemsByRunFromPostgres(run.id)
  const itemIds = newItems.map((it) => it.id)

  if (itemIds.length > 0) {
    await bulkRevokeShareTokensInPostgres(itemIds)
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    await bulkInsertShareTokensInPostgres(
      itemIds.map((id) => ({
        liquidationItemId: id,
        token: randomToken(),
        expiresAt,
        createdBy: profile.id,
      })),
    )
  }

  const tokenRows = await listLiveShareTokensByItemsFromPostgres(itemIds)
  const tokenByItem = new Map<string, string>()
  for (const t of tokenRows) tokenByItem.set(t.liquidation_item_id, t.token)

  const adminLegal = (property.admin_legal_info ?? {}) as any
  const propertyName = property.display_name ?? property.building_name ?? 'Consorcio'
  const monthLabel = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][parsed.month - 1]
  const periodLabelShort = `${String(parsed.month).padStart(2, '0')}/${parsed.year}`

  const base = process.env.NEXT_PUBLIC_APP_BASE_URL ?? ''

  const neighbors: NeighborMessage[] = eligibleUnits.map((u) => {
    const item = newItems.find((i) => i.unit_id === u.id)
    const itemId = item?.id ?? ''
    const subtotal =
      Number(item?.ordinary_amount ?? 0) +
      Number(item?.extraordinary_amount ?? 0) +
      Number(item?.previous_balance ?? 0)
    const token = tokenByItem.get(itemId) ?? null
    const shareUrl = token ? `${base}/l/${token}` : null

    const bankLine = adminLegal.bank?.cbu
      ? `\nPara transferir: CBU ${adminLegal.bank.cbu}${adminLegal.bank.alias ? ` · Alias ${adminLegal.bank.alias}` : ''}`
      : ''

    const message = `Hola ${u.holder_name ?? 'vecino/a'}! Ya está la liquidación de ${monthLabel} de ${propertyName}. Tu unidad ${u.code} debe pagar ${formatARS(subtotal)} con vencimiento el ${dueDates[0].date}.${bankLine}${shareUrl ? `\nDetalle: ${shareUrl}` : ''}`

    const phone = (u.holder_phone ?? '').replace(/[^\d+]/g, '')
    const whatsappBase = phone ? `https://wa.me/${phone.startsWith('+') ? phone.slice(1) : phone}` : 'https://wa.me'
    const whatsappHref = `${whatsappBase}?text=${encodeURIComponent(message)}`

    return {
      itemId,
      unitCode: u.code,
      holderName: u.holder_name,
      holderPhone: u.holder_phone,
      holderEmail: u.holder_email,
      amountToPay: Math.round(subtotal * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      message,
      shareUrl,
      whatsappHref,
    }
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: property.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_liquidation_runs',
    entityId: run.id,
    action: 'liquidation.emitted_from_planilla',
    metadata: { period: periodLabelShort, neighbors: neighbors.length, total: totalExpenses },
  })

  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
  revalidatePath(`/iadmin/liquidaciones/${run.id}`)

  return {
    runId: run.id,
    periodLabel: periodLabelShort,
    liquidated: totalExpenses,
    neighbors,
  }
}

const statementSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid(),
  monthsCount: z.number().int().min(1).max(24).optional(),
})

export async function getUnitStatement(
  input: z.input<typeof statementSchema>,
): Promise<IAdminUnitAccountStatement> {
  const parsed = statementSchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  await requireIAdmin({
    capability: 'collections.view',
    administrationId: property.administration_id,
  })

  const statement = await getIAdminUnitAccountStatement(parsed.propertyId, parsed.unitId, {
    monthsCount: parsed.monthsCount,
  })
  if (!statement) throw new Error('Unidad no encontrada')
  return statement
}
