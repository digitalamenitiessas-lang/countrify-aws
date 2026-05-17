'use server'

import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  callIAdminNextReceiptNumberInPostgres,
  deleteBankMovementInPostgres,
  existingExpensePaymentMovementInPostgres,
  getExpenseForPaymentFromPostgres,
  getLiquidationItemRunFromPostgres,
  insertBankMovementInPostgres,
  insertCollectionPaymentInPostgres,
  listOpenLiquidationItemsForPropertyFromPostgres,
  listUnpaidApprovedExpensesFromPostgres,
  sumLivePaymentsByItemIdsFromPostgres,
} from '@/lib/db/iadmin-writes'

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
    .replace(/[̀-ͯ]/g, '')
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

  const openItems = await listOpenLiquidationItemsForPropertyFromPostgres(parsed.propertyId)

  const items = openItems
    .map((row) => {
      const subtotal =
        Number(row.ordinary_amount ?? 0) +
        Number(row.extraordinary_amount ?? 0) +
        Number(row.previous_balance ?? 0)
      return {
        id: row.item_id,
        unitCode: row.unit_code ?? '—',
        holderName: row.holder_name,
        liquidationRunId: row.liquidation_run_id,
        subtotal,
        runStatus: row.run_status,
      }
    })
    .filter((x) => x.runStatus !== 'draft')

  const itemIds = items.map((i) => i.id)
  const paidByItem = await sumLivePaymentsByItemIdsFromPostgres(itemIds)

  const itemsWithBalance = items
    .map((i) => ({ ...i, balanceRemaining: Math.max(0, i.subtotal - (paidByItem.get(i.id) ?? 0)) }))
    .filter((i) => i.balanceRemaining > 0.01)

  const openExpenses = (await listUnpaidApprovedExpensesFromPostgres(parsed.propertyId)).map((e) => ({
    id: e.id,
    providerName: e.provider_name,
    description: e.description,
    amount: Number(e.amount),
  }))

  const rows: StatementAnalysisRow[] = parsed.movements.map((movement, index) => {
    const descNorm = normalize(movement.description)
    const isIncome = movement.amount > 0
    const candidates: StatementMatchCandidate[] = []

    if (isIncome) {
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

  const result: ApplyReconciliationResult = {
    collectionsApplied: 0,
    expensesPaid: 0,
    errors: [],
  }

  for (let i = 0; i < parsed.items.length; i++) {
    const item = parsed.items[i]

    try {
      if (item.kind === 'collection') {
        const liqItem = await getLiquidationItemRunFromPostgres(item.liquidationItemId)
        if (!liqItem) throw new Error('item no encontrado')
        if (liqItem.managed_property_id !== parsed.propertyId) throw new Error('item de otro consorcio')

        const movement = await insertBankMovementInPostgres({
          administrationId: parsed.administrationId,
          managedPropertyId: parsed.propertyId,
          cashAccountId: item.cashAccountId,
          movementDate: item.paidAt,
          description: item.description ?? 'Cobranza (conciliacion automatica)',
          amount: item.amount,
          externalRef: item.reference ?? null,
          movementKind: 'collection',
          createdBy: profile.id,
        })

        const receiptNumber = await callIAdminNextReceiptNumberInPostgres(parsed.administrationId)

        try {
          await insertCollectionPaymentInPostgres({
            administrationId: parsed.administrationId,
            managedPropertyId: parsed.propertyId,
            liquidationRunId: liqItem.liquidation_run_id,
            liquidationItemId: item.liquidationItemId,
            unitId: liqItem.unit_id,
            cashAccountId: item.cashAccountId,
            bankMovementId: movement.id,
            amount: item.amount,
            surchargeAmount: 0,
            paidAt: item.paidAt,
            method: 'transferencia',
            reference: item.reference ?? null,
            receiptNumber,
            dueLabel: null,
            notes: null,
            createdBy: profile.id,
          })
        } catch (error) {
          await deleteBankMovementInPostgres(movement.id)
          throw error
        }
        result.collectionsApplied += 1
      } else {
        const expense = await getExpenseForPaymentFromPostgres(item.expenseId)
        if (!expense) throw new Error('gasto no encontrado')
        if (expense.managed_property_id !== parsed.propertyId) throw new Error('gasto de otro consorcio')

        if (await existingExpensePaymentMovementInPostgres(item.expenseId)) {
          throw new Error('gasto ya pagado')
        }

        await insertBankMovementInPostgres({
          administrationId: parsed.administrationId,
          managedPropertyId: parsed.propertyId,
          cashAccountId: item.cashAccountId,
          movementDate: item.paidAt,
          description: `Pago a proveedor: ${expense.description}`,
          amount: -Number(expense.amount),
          externalRef: item.reference ?? null,
          movementKind: 'expense_payment',
          expenseId: item.expenseId,
          createdBy: profile.id,
        })
        result.expensesPaid += 1
      }
    } catch (error) {
      result.errors.push({
        index: i,
        reason: error instanceof Error ? error.message : 'Error desconocido',
      })
    }
  }

  await insertIAdminAuditLogInPostgres({
    administrationId: parsed.administrationId,
    actorProfileId: profile.id,
    entityType: 'iadmin_managed_properties',
    entityId: parsed.propertyId,
    action: 'reconciliation.applied',
    metadata: {
      collections: result.collectionsApplied,
      expenses: result.expensesPaid,
      errors: result.errors.length,
    },
  })

  return result
}
