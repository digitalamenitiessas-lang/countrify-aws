'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { findMembership, requireIAdmin } from '@/lib/auth'
import { canLiquidationTransition } from '@/lib/iadmin/liquidation-status'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  bulkInsertLiquidationItemsInPostgres,
  deleteLiquidationItemsForRunInPostgres,
  getAccountingPeriodFromPostgres,
  getExistingLiquidationRunForPeriodFromPostgres,
  getLiquidationRunWithAdminFromPostgres,
  getManagedPropertyAdminIdFromPostgres,
  getMostRecentPriorRunWithItemsFromPostgres,
  listActiveUnitsWithProrataFromPostgres,
  listImputedExpensesByPeriodFromPostgres,
  sumLivePaymentsByItemIdsFromPostgres,
  updateLiquidationRunStatusInPostgres,
  upsertLiquidationRunInPostgres,
} from '@/lib/db/iadmin-writes'
import type { IAdminCapability } from '@/lib/types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function defaultDueDates(periodYear: number, periodMonth: number) {
  const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1
  const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear
  const mm = String(nextMonth).padStart(2, '0')
  return [
    { label: '1er vencimiento', date: `${nextYear}-${mm}-10`, surcharge_pct: 0 },
    { label: '2do vencimiento', date: `${nextYear}-${mm}-25`, surcharge_pct: 3 },
  ]
}

const dueDateInput = z.object({
  label: z.string().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  surcharge_pct: z.number().min(0).max(100),
})

const generateSchema = z.object({
  propertyId: z.string().uuid(),
  accountingPeriodId: z.string().uuid(),
  dueDates: z.array(dueDateInput).max(6).optional(),
})

export async function generateLiquidationRun(input: z.input<typeof generateSchema>) {
  const parsed = generateSchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const period = await getAccountingPeriodFromPostgres(parsed.accountingPeriodId)
  if (!period) throw new Error('Periodo contable no encontrado')
  if (period.managed_property_id !== parsed.propertyId) {
    throw new Error('El periodo no pertenece al consorcio indicado')
  }

  const { profile } = await requireIAdmin({
    capability: 'liquidations.create',
    administrationId: property.administration_id,
  })

  const existingRun = await getExistingLiquidationRunForPeriodFromPostgres({
    managedPropertyId: parsed.propertyId,
    accountingPeriodId: parsed.accountingPeriodId,
  })

  if (existingRun && (existingRun.status === 'issued' || existingRun.status === 'closed')) {
    throw new Error(
      `Ya existe una liquidacion ${existingRun.status}. Reabri primero para poder recalcular.`,
    )
  }

  const expenses = await listImputedExpensesByPeriodFromPostgres({
    managedPropertyId: parsed.propertyId,
    accountingPeriodId: parsed.accountingPeriodId,
  })

  let ordinaryTotal = 0
  let extraordinaryTotal = 0
  for (const e of expenses) {
    const amt = Number(e.amount)
    if ((e.expense_kind ?? 'ordinaria') === 'extraordinaria') {
      extraordinaryTotal += amt
    } else {
      ordinaryTotal += amt
    }
  }
  ordinaryTotal = round2(ordinaryTotal)
  extraordinaryTotal = round2(extraordinaryTotal)
  const totalExpenses = round2(ordinaryTotal + extraordinaryTotal)

  const units = await listActiveUnitsWithProrataFromPostgres(parsed.propertyId)
  const eligibleUnits = units.filter((u) => u.prorata_coefficient !== null)
  if (eligibleUnits.length === 0) {
    throw new Error('No hay unidades activas con alicuota definida. Cargalas antes de liquidar.')
  }

  const previousBalanceByUnit = new Map<string, number>()
  const priorItems = await getMostRecentPriorRunWithItemsFromPostgres({
    managedPropertyId: parsed.propertyId,
    excludeRunId: existingRun?.id ?? null,
  })

  if (priorItems.length > 0) {
    const itemIds = priorItems.map((it) => it.item_id)
    const paidByItem = await sumLivePaymentsByItemIdsFromPostgres(itemIds)
    for (const it of priorItems) {
      const subtotal =
        Number(it.ordinary_amount ?? 0) +
        Number(it.extraordinary_amount ?? 0) +
        Number(it.previous_balance ?? 0)
      const paid = paidByItem.get(it.item_id) ?? 0
      const debt = Math.max(0, round2(subtotal - paid))
      if (debt > 0) {
        previousBalanceByUnit.set(it.unit_id, debt)
      }
    }
  }

  const dueDates =
    parsed.dueDates && parsed.dueDates.length > 0
      ? parsed.dueDates
      : defaultDueDates(period.period_year, period.period_month)

  const totalPreviousBalance = round2(
    Array.from(previousBalanceByUnit.values()).reduce((s, v) => s + v, 0),
  )

  const run = await upsertLiquidationRunInPostgres({
    administrationId: property.administration_id,
    managedPropertyId: parsed.propertyId,
    accountingPeriodId: parsed.accountingPeriodId,
    totalExpenses,
    ordinaryTotal,
    extraordinaryTotal,
    previousBalance: totalPreviousBalance,
    dueDates,
    totalUnits: eligibleUnits.length,
    generatedBy: profile.id,
  })

  await deleteLiquidationItemsForRunInPostgres(run.id)

  const items = eligibleUnits.map((u) => {
    const prorata = Number(u.prorata_coefficient)
    const ordinary = round2(ordinaryTotal * prorata)
    const extraordinary = round2(extraordinaryTotal * prorata)
    const prev = round2(previousBalanceByUnit.get(u.id) ?? 0)
    return {
      liquidation_run_id: run.id,
      unit_id: u.id,
      prorata_coefficient: prorata,
      amount: ordinary,
      ordinary_amount: ordinary,
      extraordinary_amount: extraordinary,
      previous_balance: prev,
    }
  })

  await bulkInsertLiquidationItemsInPostgres(items)

  await insertIAdminAuditLogInPostgres({
    administrationId: property.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_liquidation_runs',
    entityId: run.id,
    action: 'liquidation.calculated',
    metadata: {
      period: `${period.period_year}-${String(period.period_month).padStart(2, '0')}`,
      ordinary_total: ordinaryTotal,
      extraordinary_total: extraordinaryTotal,
      total_units: eligibleUnits.length,
      expenses_count: expenses.length,
    },
  })

  revalidatePath('/iadmin/liquidaciones')
  revalidatePath(`/iadmin/liquidaciones/${run.id}`)
  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)

  return {
    id: run.id,
    ordinaryTotal,
    extraordinaryTotal,
    totalUnits: eligibleUnits.length,
  }
}

const transitionSchema = z.object({
  runId: z.string().uuid(),
  nextStatus: z.enum(['draft', 'calculated', 'issued', 'closed']),
})

export async function changeLiquidationStatus(input: z.input<typeof transitionSchema>) {
  const parsed = transitionSchema.parse(input)

  const run = await getLiquidationRunWithAdminFromPostgres(parsed.runId)
  if (!run) throw new Error('Corrida de liquidacion no encontrada')

  const { profile, context } = await requireIAdmin({ capability: 'liquidations.view' })

  if (!context.isSuperAdmin) {
    const membership = findMembership(context, run.administration_id)
    const capabilities: ReadonlySet<IAdminCapability> = new Set(membership?.capabilities ?? [])
    if (!canLiquidationTransition(run.status as any, parsed.nextStatus, capabilities)) {
      throw new Error('Transicion no permitida para tu rol')
    }
  }

  await updateLiquidationRunStatusInPostgres({
    runId: parsed.runId,
    nextStatus: parsed.nextStatus,
    actorProfileId: profile.id,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: run.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_liquidation_runs',
    entityId: parsed.runId,
    action: `liquidation.${parsed.nextStatus}`,
  })

  revalidatePath('/iadmin/liquidaciones')
  revalidatePath(`/iadmin/liquidaciones/${parsed.runId}`)
  revalidatePath(`/iadmin/consorcios/${run.managed_property_id}`)
}
