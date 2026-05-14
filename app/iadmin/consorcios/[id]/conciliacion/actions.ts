'use server'

import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// ----------------------------------------------------------------------------
// Analyze statement: dado un listado de movimientos bancarios, sugerir el match
// contra cobranzas de vecinos o pagos a proveedores.
// ----------------------------------------------------------------------------

const movementSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(400),
  amount: z.number(),
  reference: z.string().trim().max(120).optional(),
})

export type StatementMovement = z.infer<typeof movementSchema>

const analyzeSchema = z.object({
  administrationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  movements: z.array(movementSchema).min(1).max(500),
})

export type StatementMatchCandidate =
  | {
      kind: 'collection'
      liquidationItemId: string
      unitCode: string
      holderName: string | null
      liquidationRunId: string
      subtotal: number
      balanceRemaining: number
      score: number
      reason: string
    }
  | {
      kind: 'expense_payment'
      expenseId: string
      providerName: string | null
      description: string
      amount: number
      score: number
      reason: string
    }
  | {
      kind: 'unknown'
      reason: string
    }

export type StatementAnalysisRow = {
  index: number
  movement: StatementMovement
  candidates: StatementMatchCandidate[]
  bestScore: number
}

export type StatementAnalysisResult = {
  rows: StatementAnalysisRow[]
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameTokens(fullName: string): string[] {
  return normalize(fullName)
    .split(' ')
    .filter((t) => t.length >= 3)
}

function scoreMatch(descNormalized: string, target: string): number {
  if (!target) return 0
  const targetTokens = nameTokens(target)
  if (targetTokens.length === 0) return 0
  let hits = 0
  for (const tok of targetTokens) {
    if (descNormalized.includes(tok)) hits += 1
  }
  return hits / targetTokens.length
}

export async function analyzeBankStatement(
  input: z.input<typeof analyzeSchema>,
): Promise<StatementAnalysisResult> {
  const parsed = analyzeSchema.parse(input)
  await requireIAdmin({
    capability: 'collections.register',
    administrationId: parsed.administrationId,
  })

  const supabase = await getSupabaseServerClient()
  if (!supabase) throw new Error('Supabase no configurado')

  // Traemos items de la ultima corrida issued/closed no pagada
  const { data: openItems } = await supabase
    .from('iadmin_liquidation_items')
    .select(`
      id, unit_id, ordinary_amount, extraordinary_amount, previous_balance, liquidation_run_id,
      iadmin_liquidation_runs!inner (status, managed_property_id),
      iadmin_units!inner (code, iadmin_unit_holders(full_name, is_active))
    `)
    .eq('iadmin_liquidation_runs.managed_property_id', parsed.propertyId)
    .in('iadmin_liquidation_runs.status', ['calculated', 'issued', 'closed'])

  const items = (openItems ?? [])
    .map((row: any) => {
      const run = Array.isArray(row.iadmin_liquidation_runs) ? row.iadmin_liquidation_runs[0] : row.iadmin_liquidation_runs
      const unit = Array.isArray(row.iadmin_units) ? row.iadmin_units[0] : row.iadmin_units
      const holders = Array.isArray(unit?.iadmin_unit_holders) ? unit.iadmin_unit_holders : []
      const activeHolder = holders.find((h: any) => h?.is_active) ?? holders[0] ?? null
      const subtotal =
        Number(row.ordinary_amount ?? 0) + Number(row.extraordinary_amount ?? 0) + Number(row.previous_balance ?? 0)
      return {
        id: row.id as string,
        unitCode: unit?.code ?? '—',
        holderName: activeHolder?.full_name ?? null,
        liquidationRunId: row.liquidation_run_id as string,
        subtotal,
        runStatus: run?.status as string,
      }
    })
    .filter((x) => x.runStatus !== 'draft')

  // Restamos pagos vivos para tener balanceRemaining
  const itemIds = items.map((i) => i.id)
  const paidByItem = new Map<string, number>()
  if (itemIds.length > 0) {
    const { data: payments } = await supabase
      .from('iadmin_payments')
      .select('liquidation_item_id, amount')
      .in('liquidation_item_id', itemIds)
      .eq('is_void', false)
    for (const p of payments ?? []) {
      if (!p.liquidation_item_id) continue
      paidByItem.set(p.liquidation_item_id as string, (paidByItem.get(p.liquidation_item_id as string) ?? 0) + Number(p.amount))
    }
  }

  const itemsWithBalance = items
    .map((i) => ({ ...i, balanceRemaining: Math.max(0, i.subtotal - (paidByItem.get(i.id) ?? 0)) }))
    .filter((i) => i.balanceRemaining > 0.01)

  // Gastos approved no pagados (para egresos)
  const { data: expensesRaw } = await supabase
    .from('iadmin_expenses')
    .select('id, description, amount, iadmin_providers(name)')
    .eq('managed_property_id', parsed.propertyId)
    .in('status', ['approved', 'imputed'])

  const paidExpenseIds = new Set<string>()
  if (expensesRaw && expensesRaw.length > 0) {
    const expIds = expensesRaw.map((e: any) => e.id)
    const { data: paidRows } = await supabase
      .from('iadmin_bank_movements')
      .select('expense_id')
      .eq('movement_kind', 'expense_payment')
      .in('expense_id', expIds)
    for (const r of paidRows ?? []) {
      if (r.expense_id) paidExpenseIds.add(r.expense_id as string)
    }
  }

  const openExpenses = (expensesRaw ?? [])
    .filter((e: any) => !paidExpenseIds.has(e.id))
    .map((e: any) => {
      const provider = Array.isArray(e.iadmin_providers) ? e.iadmin_providers[0] : e.iadmin_providers
      return {
        id: e.id as string,
        providerName: provider?.name ?? null,
        description: e.description as string,
        amount: Number(e.amount),
      }
    })

  // Matching
  const rows: StatementAnalysisRow[] = parsed.movements.map((movement, index) => {
    const descNorm = normalize(movement.description)
    const isIncome = movement.amount > 0
    const candidates: StatementMatchCandidate[] = []

    if (isIncome) {
      // Matchear con items pendientes de cobro
      for (const it of itemsWithBalance) {
        const nameScore = it.holderName ? scoreMatch(descNorm, it.holderName) : 0
        const unitScore = descNorm.includes(normalize(it.unitCode)) ? 0.2 : 0
        const amountScore =
          Math.abs(movement.amount - it.balanceRemaining) / Math.max(it.balanceRemaining, 1) < 0.01
            ? 0.4
            : Math.abs(movement.amount - it.subtotal) / Math.max(it.subtotal, 1) < 0.01
              ? 0.35
              : 0
        const score = Math.min(1, nameScore * 0.6 + amountScore + unitScore)
        if (score >= 0.5) {
          candidates.push({
            kind: 'collection',
            liquidationItemId: it.id,
            liquidationRunId: it.liquidationRunId,
            unitCode: it.unitCode,
            holderName: it.holderName,
            subtotal: Math.round(it.subtotal * 100) / 100,
            balanceRemaining: Math.round(it.balanceRemaining * 100) / 100,
            score,
            reason:
              amountScore > 0
                ? `Monto coincide con saldo pendiente del ${it.unitCode}`
                : `Nombre en descripción matchea ${it.holderName ?? it.unitCode}`,
          })
        }
      }
    } else {
      // Egreso: matchear con gasto approved por nombre de proveedor o descripcion
      const outflow = Math.abs(movement.amount)
      for (const e of openExpenses) {
        const provScore = e.providerName ? scoreMatch(descNorm, e.providerName) : 0
        const descScore = scoreMatch(descNorm, e.description)
        const amountScore =
          Math.abs(outflow - e.amount) / Math.max(e.amount, 1) < 0.01 ? 0.4 : 0
        const score = Math.min(1, Math.max(provScore, descScore) * 0.6 + amountScore)
        if (score >= 0.5) {
          candidates.push({
            kind: 'expense_payment',
            expenseId: e.id,
            providerName: e.providerName,
            description: e.description,
            amount: e.amount,
            score,
            reason: amountScore > 0
              ? `Monto coincide con gasto pendiente ${e.providerName ?? ''}`.trim()
              : `Nombre de proveedor en descripción`,
          })
        }
      }
    }

    candidates.sort((a, b) => (b.kind === 'unknown' ? 0 : b.score) - (a.kind === 'unknown' ? 0 : a.score))

    if (candidates.length === 0) {
      candidates.push({
        kind: 'unknown',
        reason: isIncome ? 'No se encontro vecino con deuda que matchee' : 'No se encontro gasto pendiente que matchee',
      })
    }

    return {
      index,
      movement,
      candidates: candidates.slice(0, 3),
      bestScore: candidates[0] && candidates[0].kind !== 'unknown' ? candidates[0].score : 0,
    }
  })

  return { rows }
}

// ----------------------------------------------------------------------------
// Apply reconciliation: crear payments y marcar gastos pagados en bulk
// ----------------------------------------------------------------------------

const applyItemSchema = z.union([
  z.object({
    kind: z.literal('collection'),
    liquidationItemId: z.string().uuid(),
    cashAccountId: z.string().uuid(),
    amount: z.number().positive(),
    paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().max(400).optional(),
    reference: z.string().max(120).optional(),
  }),
  z.object({
    kind: z.literal('expense_payment'),
    expenseId: z.string().uuid(),
    cashAccountId: z.string().uuid(),
    paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reference: z.string().max(120).optional(),
  }),
])

const applySchema = z.object({
  administrationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  items: z.array(applyItemSchema).min(1).max(200),
})

export type ApplyReconciliationResult = {
  collectionsApplied: number
  expensesPaid: number
  errors: Array<{ index: number; reason: string }>
}

export async function applyReconciliation(
  input: z.input<typeof applySchema>,
): Promise<ApplyReconciliationResult> {
  const parsed = applySchema.parse(input)
  const { profile } = await requireIAdmin({
    capability: 'collections.register',
    administrationId: parsed.administrationId,
  })

  const supabase = await getSupabaseServerClient()
  if (!supabase) throw new Error('Supabase no configurado')

  const result: ApplyReconciliationResult = {
    collectionsApplied: 0,
    expensesPaid: 0,
    errors: [],
  }

  for (let i = 0; i < parsed.items.length; i++) {
    const item = parsed.items[i]

    try {
      if (item.kind === 'collection') {
        // Crear bank movement (ingreso) + obtener receipt number + crear payment
        const { data: liqItem } = await supabase
          .from('iadmin_liquidation_items')
          .select('id, unit_id, liquidation_run_id, iadmin_liquidation_runs!inner(managed_property_id)')
          .eq('id', item.liquidationItemId)
          .maybeSingle()
        if (!liqItem) throw new Error('item no encontrado')
        const run = Array.isArray(liqItem.iadmin_liquidation_runs) ? liqItem.iadmin_liquidation_runs[0] : liqItem.iadmin_liquidation_runs
        if (run?.managed_property_id !== parsed.propertyId) throw new Error('item de otro consorcio')

        const { data: movement, error: movError } = await supabase
          .from('iadmin_bank_movements')
          .insert({
            administration_id: parsed.administrationId,
            managed_property_id: parsed.propertyId,
            cash_account_id: item.cashAccountId,
            movement_date: item.paidAt,
            description: item.description ?? 'Cobranza (conciliacion automatica)',
            amount: item.amount,
            external_ref: item.reference ?? null,
            movement_kind: 'collection',
            created_by: profile.id,
          })
          .select('id')
          .single()
        if (movError) throw new Error(movError.message)

        const { data: receiptRpc, error: receiptError } = await supabase.rpc('iadmin_next_receipt_number', {
          admin_id: parsed.administrationId,
        })
        if (receiptError) throw new Error(receiptError.message)

        const { error: payError } = await supabase.from('iadmin_payments').insert({
          administration_id: parsed.administrationId,
          managed_property_id: parsed.propertyId,
          liquidation_run_id: liqItem.liquidation_run_id,
          liquidation_item_id: item.liquidationItemId,
          unit_id: liqItem.unit_id,
          cash_account_id: item.cashAccountId,
          bank_movement_id: movement.id,
          amount: item.amount,
          paid_at: item.paidAt,
          method: 'transferencia',
          reference: item.reference ?? null,
          receipt_number: receiptRpc,
          created_by: profile.id,
        })
        if (payError) {
          await supabase.from('iadmin_bank_movements').delete().eq('id', movement.id)
          throw new Error(payError.message)
        }
        result.collectionsApplied += 1
      } else {
        // expense_payment
        const { data: expense } = await supabase
          .from('iadmin_expenses')
          .select('id, administration_id, managed_property_id, amount, description, status')
          .eq('id', item.expenseId)
          .maybeSingle()
        if (!expense) throw new Error('gasto no encontrado')
        if (expense.managed_property_id !== parsed.propertyId) throw new Error('gasto de otro consorcio')

        // Evitar doble pago
        const { data: existing } = await supabase
          .from('iadmin_bank_movements')
          .select('id')
          .eq('expense_id', item.expenseId)
          .eq('movement_kind', 'expense_payment')
          .maybeSingle()
        if (existing) throw new Error('gasto ya pagado')

        const { error: movError } = await supabase.from('iadmin_bank_movements').insert({
          administration_id: parsed.administrationId,
          managed_property_id: parsed.propertyId,
          cash_account_id: item.cashAccountId,
          movement_date: item.paidAt,
          description: `Pago a proveedor: ${expense.description}`,
          amount: -Number(expense.amount),
          external_ref: item.reference ?? null,
          movement_kind: 'expense_payment',
          expense_id: item.expenseId,
          created_by: profile.id,
        })
        if (movError) throw new Error(movError.message)
        result.expensesPaid += 1
      }
    } catch (error) {
      result.errors.push({
        index: i,
        reason: error instanceof Error ? error.message : 'Error desconocido',
      })
    }
  }

  await supabase.from('iadmin_audit_logs').insert({
    administration_id: parsed.administrationId,
    actor_profile_id: profile.id,
    entity_type: 'iadmin_managed_properties',
    entity_id: parsed.propertyId,
    action: 'reconciliation.applied',
    metadata: {
      collections: result.collectionsApplied,
      expenses: result.expensesPaid,
      errors: result.errors.length,
    },
  })

  return result
}
