'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { findMembership, requireIAdmin } from '@/lib/auth'
import { canLiquidationTransition } from '@/lib/iadmin/liquidation-status'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  notifyLiquidationClosed,
  notifyLiquidationIssued,
} from '@/lib/email/notifications/liquidations'
import {
  assertProrataNotOver100,
  bulkInsertLiquidationItemsInPostgres,
  createLedgerEntriesForIssuedRunInPostgres,
  deleteLiquidationItemsForRunInPostgres,
  getAccountingPeriodFromPostgres,
  getExistingLiquidationRunForPeriodFromPostgres,
  getLiquidationRunWithAdminFromPostgres,
  getManagedPropertyAdminIdFromPostgres,
  getManagedPropertyOperationalSettingsFromPostgres,
  getRunPaymentStatsFromPostgres,
  listActiveUnitsWithProrataFromPostgres,
  listImputedExpensesByPeriodFromPostgres,
  sumOpenLedgerBalanceByUnitForPropertyFromPostgres,
  updateLiquidationRunStatusInPostgres,
  upsertLiquidationRunInPostgres,
  voidLedgerEntriesForRunInPostgres,
} from '@/lib/db/iadmin-writes'
import type { IAdminCapability } from '@/lib/types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function defaultDueDates(
  periodYear: number,
  periodMonth: number,
  rules?: Array<{ label?: string; day?: number; surchargePct?: number }> | null,
) {
  const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1
  const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear
  const mm = String(nextMonth).padStart(2, '0')
  const source =
    rules && rules.length > 0
      ? rules
      : [
          { label: '1er vencimiento', day: 10, surchargePct: 0 },
          { label: '2do vencimiento', day: 25, surchargePct: 3 },
        ]
  return source.map((rule) => ({
    label: rule.label ?? 'Vencimiento',
    date: `${nextYear}-${mm}-${String(Math.max(1, Math.min(28, Number(rule.day ?? 10)))).padStart(2, '0')}`,
    surcharge_pct: Number(rule.surchargePct ?? 0),
  }))
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

  await assertProrataNotOver100(parsed.propertyId)

  const existingRun = await getExistingLiquidationRunForPeriodFromPostgres({
    managedPropertyId: parsed.propertyId,
    accountingPeriodId: parsed.accountingPeriodId,
  })

  if (existingRun && (existingRun.status === 'issued' || existingRun.status === 'closed')) {
    // Para que el mensaje sea util al admin, contamos los pagos vivos que se
    // verian afectados si decide reabrir y recalcular.
    const stats = await getRunPaymentStatsFromPostgres(existingRun.id)
    const statusLabel = existingRun.status === 'issued' ? 'emitida' : 'cerrada'
    const paymentsLine = stats.count > 0
      ? ` Hay ${stats.count} pago${stats.count === 1 ? '' : 's'} cobrado${stats.count === 1 ? '' : 's'} (total $${stats.total.toFixed(2)}) que quedan desvinculados si reabrís.`
      : ''
    throw new Error(
      `Ya existe una liquidación ${statusLabel} para este período (${existingRun.id.slice(0, 8)}).` +
        ` Tenés que reabrirla desde Liquidaciones para recalcular.${paymentsLine}`,
    )
  }

  const expenses = await listImputedExpensesByPeriodFromPostgres({
    managedPropertyId: parsed.propertyId,
    accountingPeriodId: parsed.accountingPeriodId,
  })

  // Gastos particulares (unit_id seteado) no se prorratean: van enteros a su
  // unidad. Los separamos de la base prorrateable.
  let ordinaryTotal = 0
  let extraordinaryTotal = 0
  const particularByUnit = new Map<string, number>()
  for (const e of expenses) {
    const amt = Number(e.amount)
    if (e.unit_id) {
      particularByUnit.set(e.unit_id, (particularByUnit.get(e.unit_id) ?? 0) + amt)
    } else if ((e.expense_kind ?? 'ordinaria') === 'extraordinaria') {
      extraordinaryTotal += amt
    } else {
      ordinaryTotal += amt
    }
  }
  ordinaryTotal = round2(ordinaryTotal)
  extraordinaryTotal = round2(extraordinaryTotal)
  const particularTotal = round2(
    Array.from(particularByUnit.values()).reduce((s, v) => s + v, 0),
  )
  const totalExpenses = round2(ordinaryTotal + extraordinaryTotal + particularTotal)

  const units = await listActiveUnitsWithProrataFromPostgres(parsed.propertyId)
  const eligibleUnits = units.filter((u) => u.prorata_coefficient !== null)
  if (eligibleUnits.length === 0) {
    throw new Error('No hay unidades activas con alicuota definida. Cargalas antes de liquidar.')
  }

  // Saldo anterior = deuda viva real acumulada en el ledger (modelo
  // acumulativo). Es la suma de los asientos abiertos de meses previos por
  // unidad (ordinarias/extraordinarias/recargos impagos), fuente autoritativa
  // y siempre consistente con el estado de cuenta del vecino. Excluimos el run
  // que se está (re)generando por las dudas, aunque en 'calculated' todavía no
  // tiene asientos (el ledger se escribe al emitir).
  const previousBalanceByUnit = await sumOpenLedgerBalanceByUnitForPropertyFromPostgres({
    managedPropertyId: parsed.propertyId,
    excludeRunId: existingRun?.id ?? null,
  })

  const propertySettings = await getManagedPropertyOperationalSettingsFromPostgres(parsed.propertyId)
  const configuredRules = Array.isArray(propertySettings?.operational_settings?.dueDateRules)
    ? (propertySettings?.operational_settings?.dueDateRules as Array<{ label?: string; day?: number; surchargePct?: number }>)
    : null

  const dueDates =
    parsed.dueDates && parsed.dueDates.length > 0
      ? parsed.dueDates
      : defaultDueDates(period.period_year, period.period_month, configuredRules)

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
    const particular = round2(particularByUnit.get(u.id) ?? 0)
    const prev = round2(previousBalanceByUnit.get(u.id) ?? 0)
    return {
      liquidation_run_id: run.id,
      unit_id: u.id,
      prorata_coefficient: prorata,
      amount: ordinary,
      ordinary_amount: ordinary,
      extraordinary_amount: extraordinary,
      previous_balance: prev,
      particular_amount: particular,
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
  // El admin tiene que aceptar explicitamente reabrir cuando hay pagos vivos.
  // La UI primero llama a getLiquidationReopenImpact, muestra el modal con la
  // info, y solo despues llama con acknowledgePaymentImpact=true.
  acknowledgePaymentImpact: z.boolean().optional().default(false),
})

export async function getLiquidationReopenImpact(runId: string): Promise<{
  livePaymentsCount: number
  livePaymentsTotal: number
  currentStatus: string
}> {
  const run = await getLiquidationRunWithAdminFromPostgres(runId)
  if (!run) throw new Error('Corrida de liquidacion no encontrada')
  await requireIAdmin({ capability: 'liquidations.view', administrationId: run.administration_id })
  const stats = await getRunPaymentStatsFromPostgres(runId)
  return {
    livePaymentsCount: stats.count,
    livePaymentsTotal: stats.total,
    currentStatus: run.status,
  }
}

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

  const isReopen =
    (parsed.nextStatus === 'calculated' || parsed.nextStatus === 'draft') &&
    (run.status === 'issued' || run.status === 'closed')

  if (parsed.nextStatus === 'issued') {
    await createLedgerEntriesForIssuedRunInPostgres({
      runId: parsed.runId,
      actorProfileId: profile.id,
    })
  } else if (isReopen) {
    // Safety gate: si hay pagos vivos, exigir confirmación explícita.
    const stats = await getRunPaymentStatsFromPostgres(parsed.runId)
    if (stats.count > 0 && !parsed.acknowledgePaymentImpact) {
      throw new Error(
        `Esta liquidación tiene ${stats.count} pago${stats.count === 1 ? '' : 's'} vigente${stats.count === 1 ? '' : 's'} ` +
          `(total $${stats.total.toFixed(2)}). Reabrirla anula los asientos del ledger y desvincula esos pagos. ` +
          `Confirmá la acción desde la UI o llamá con acknowledgePaymentImpact=true.`,
      )
    }
    await voidLedgerEntriesForRunInPostgres({
      runId: parsed.runId,
      actorProfileId: profile.id,
      reason: `reopened_to_${parsed.nextStatus}`,
      allowWithLivePayments: parsed.acknowledgePaymentImpact,
    })
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

  // Notificaciones por mail. Solo en transiciones a issued/closed; los
  // helpers son best-effort (capturan errores internamente) y se disparan
  // fire-and-forget para no bloquear la response del backoffice. La
  // idempotencia evita doble envio si por alguna razon la action se
  // reintenta.
  if (parsed.nextStatus === 'issued') {
    void notifyLiquidationIssued(parsed.runId)
  } else if (parsed.nextStatus === 'closed') {
    void notifyLiquidationClosed(parsed.runId, profile.id)
  }

  revalidatePath('/iadmin/liquidaciones')
  revalidatePath(`/iadmin/liquidaciones/${parsed.runId}`)
  revalidatePath(`/iadmin/consorcios/${run.managed_property_id}`)
}
