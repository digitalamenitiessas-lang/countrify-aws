'use server'

import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { runAIChat, stripJsonFences } from '@/lib/iadmin/ai-chat'
import {
  getManagedPropertyForProjectionFromPostgres,
  listActivePaymentsForProjectionFromPostgres,
  listCashAccountsByPropertyFromPostgres,
  listImputedExpensesForProjectionFromPostgres,
  listIssuedLiquidationRunsForProjectionFromPostgres,
  sumBankMovementsForAccountsFromPostgres,
} from '@/lib/db/iadmin-writes'

const schema = z.object({
  propertyId: z.string().uuid(),
})

export type GenerateProjectionInput = z.input<typeof schema>

export type ExpenseProjectionLine = {
  category: string
  providerName?: string | null
  expected: number
  note?: string
}

export type ProjectionResult = {
  periodLabel: string
  expectedTotalExpenses: number
  recommendedOrdinaryPerUnit: number | null
  lines: ExpenseProjectionLine[]
  cashProjection: {
    currentBalance: number
    expectedIncome: number
    expectedExpenses: number
    endingBalance: number
  }
  collectionsAssessment: {
    historicalRatePct: number | null
    expectedRatePct: number
    note: string
  }
  alerts: Array<{ severity: 'info' | 'warning' | 'danger'; message: string }>
  narrative: string
}

const SYSTEM_PROMPT = `Sos un analista financiero senior de consorcios/edificios en Argentina.
Tu tarea es mirar el historial operativo (gastos ultimos meses, cobranzas, saldos) y proyectar el proximo mes del consorcio, con criterio conservador.

Devolvés SIEMPRE un JSON exactamente con este formato:
{
  "periodLabel": "MM/YYYY del mes que proyectas",
  "expectedTotalExpenses": numero (total esperado de gastos ordinarios el proximo mes),
  "recommendedOrdinaryPerUnit": numero o null (expensa ordinaria sugerida por unidad, si es razonable proponer una),
  "lines": [
    {"category": "Luz|Gas|Ascensores|...", "providerName": "proveedor si aplica o null", "expected": numero, "note": "justificacion breve"}
  ],
  "cashProjection": {
    "currentBalance": numero,
    "expectedIncome": numero,
    "expectedExpenses": numero,
    "endingBalance": numero
  },
  "collectionsAssessment": {
    "historicalRatePct": numero o null,
    "expectedRatePct": numero,
    "note": "texto corto"
  },
  "alerts": [
    {"severity": "info|warning|danger", "message": "texto"}
  ],
  "narrative": "resumen ejecutivo en 3-4 oraciones, tono de informe al administrador titular, en español rioplatense"
}

Reglas:
- No inventes datos. Si el historial es corto o falta info, bajá expectativas y mencionalo en alerts.
- Usa la inflacion implicita en los ultimos meses para proyectar de forma conservadora (no agresiva).
- Si ves gastos habituales que no aparecieron, marcarlos como alert: missing_expected.
- Si la tasa de cobranza fue baja, reflejarlo en el ending balance.
- Devolvé SOLO el JSON, sin markdown, sin explicaciones fuera del campo "narrative".`

export async function generateProjection(input: GenerateProjectionInput): Promise<ProjectionResult> {
  const parsed = schema.parse(input)

  const property = await getManagedPropertyForProjectionFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  await requireIAdmin({
    capability: 'reports.view',
    administrationId: property.administration_id,
  })

  const propertyName = property.display_name ?? property.building_name ?? 'Consorcio'
  const totalUnits = property.total_units ?? 0

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const fromDate = sixMonthsAgo.toISOString().slice(0, 10)

  const [expenses, cashAccounts, runs, payments] = await Promise.all([
    listImputedExpensesForProjectionFromPostgres({ managedPropertyId: parsed.propertyId, fromDate }),
    listCashAccountsByPropertyFromPostgres(parsed.propertyId),
    listIssuedLiquidationRunsForProjectionFromPostgres({ managedPropertyId: parsed.propertyId, limit: 6 }),
    listActivePaymentsForProjectionFromPostgres(parsed.propertyId),
  ])

  const activeAccountIds = cashAccounts.filter((a) => a.is_active).map((a) => a.id)
  const currentBalance = await sumBankMovementsForAccountsFromPostgres(activeAccountIds)

  const totalLiquidated = runs.reduce(
    (s, r) => s + Number(r.ordinary_total ?? 0) + Number(r.extraordinary_total ?? 0),
    0,
  )
  const collectedByRun = new Map<string, number>()
  for (const p of payments) {
    if (!p.liquidation_run_id) continue
    collectedByRun.set(p.liquidation_run_id, (collectedByRun.get(p.liquidation_run_id) ?? 0) + Number(p.amount))
  }
  const totalCollected = Array.from(collectedByRun.values()).reduce((s, v) => s + v, 0)
  const historicalRatePct = totalLiquidated > 0 ? Math.round((totalCollected / totalLiquidated) * 100) : null

  const monthlyBuckets = new Map<string, { total: number; byCategory: Record<string, number> }>()
  for (const e of expenses) {
    if (!e.issued_at) continue
    const key = e.issued_at.slice(0, 7)
    const bucket = monthlyBuckets.get(key) ?? { total: 0, byCategory: {} }
    bucket.total += Number(e.amount)
    const cat = e.category ?? 'Otros'
    bucket.byCategory[cat] = (bucket.byCategory[cat] ?? 0) + Number(e.amount)
    monthlyBuckets.set(key, bucket)
  }

  const monthlyHistory = Array.from(monthlyBuckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, b]) => ({
      month,
      total: Math.round(b.total),
      by_category: Object.fromEntries(Object.entries(b.byCategory).map(([k, v]) => [k, Math.round(v)])),
    }))

  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const nextLabel = `${String(nextMonth.getMonth() + 1).padStart(2, '0')}/${nextMonth.getFullYear()}`

  const contextJson = {
    property: propertyName,
    total_units: totalUnits,
    management_fee_pct: property.management_fee_pct !== null ? Number(property.management_fee_pct) : null,
    current_balance: Math.round(currentBalance),
    historical_collection_rate_pct: historicalRatePct,
    next_period_label: nextLabel,
    last_6_months: monthlyHistory,
    last_runs: runs.map((r) => ({
      period:
        r.period_year && r.period_month
          ? `${String(r.period_month).padStart(2, '0')}/${r.period_year}`
          : '—',
      ordinary: Math.round(Number(r.ordinary_total ?? 0)),
      extraordinary: Math.round(Number(r.extraordinary_total ?? 0)),
    })),
  }

  const userPrompt = `Datos del consorcio (JSON):\n${JSON.stringify(contextJson, null, 2)}\n\nProyectá el período ${nextLabel} con estos datos.`

  const raw = await runAIChat({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 1800,
  })

  const cleaned = stripJsonFences(raw)
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(cleaned)
  } catch {
    throw new Error('La IA devolvio un formato invalido')
  }

  const resultSchema = z.object({
    periodLabel: z.string(),
    expectedTotalExpenses: z.number(),
    recommendedOrdinaryPerUnit: z.number().nullable(),
    lines: z.array(
      z.object({
        category: z.string(),
        providerName: z.string().nullable().optional(),
        expected: z.number(),
        note: z.string().optional(),
      }),
    ),
    cashProjection: z.object({
      currentBalance: z.number(),
      expectedIncome: z.number(),
      expectedExpenses: z.number(),
      endingBalance: z.number(),
    }),
    collectionsAssessment: z.object({
      historicalRatePct: z.number().nullable(),
      expectedRatePct: z.number(),
      note: z.string(),
    }),
    alerts: z.array(
      z.object({
        severity: z.enum(['info', 'warning', 'danger']),
        message: z.string(),
      }),
    ),
    narrative: z.string(),
  })

  const result = resultSchema.safeParse(parsedJson)
  if (!result.success) {
    throw new Error(`La IA devolvio un formato incompleto: ${result.error.message}`)
  }

  return result.data
}
