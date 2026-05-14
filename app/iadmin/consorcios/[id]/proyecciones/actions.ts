'use server'

import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { runAIChat, stripJsonFences } from '@/lib/iadmin/ai-chat'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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
  const supabase = await getSupabaseServerClient()
  if (!supabase) throw new Error('Supabase no configurado')

  const { data: property } = await supabase
    .from('iadmin_managed_properties')
    .select('id, administration_id, display_name, management_fee_pct, buildings(name, total_units)')
    .eq('id', parsed.propertyId)
    .maybeSingle()
  if (!property) throw new Error('Consorcio no encontrado')

  const { context } = await requireIAdmin({
    capability: 'reports.view',
    administrationId: property.administration_id,
  })
  void context

  const building = property.buildings
    ? Array.isArray(property.buildings)
      ? property.buildings[0]
      : property.buildings
    : null
  const propertyName = property.display_name ?? building?.name ?? 'Consorcio'
  const totalUnits = building?.total_units ?? 0

  // Stats de los últimos 6 meses
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const fromDate = sixMonthsAgo.toISOString().slice(0, 10)

  const [expensesRes, cashRes, runsRes, paymentsRes] = await Promise.all([
    supabase
      .from('iadmin_expenses')
      .select('amount, category, expense_kind, issued_at, status, iadmin_providers(name)')
      .eq('managed_property_id', parsed.propertyId)
      .gte('issued_at', fromDate)
      .in('status', ['imputed', 'approved'])
      .order('issued_at', { ascending: true }),
    supabase
      .from('iadmin_cash_accounts')
      .select('id, name, kind, is_active')
      .eq('managed_property_id', parsed.propertyId),
    supabase
      .from('iadmin_liquidation_runs')
      .select('id, ordinary_total, extraordinary_total, iadmin_accounting_periods(period_year, period_month)')
      .eq('managed_property_id', parsed.propertyId)
      .in('status', ['issued', 'closed'])
      .order('generated_at', { ascending: false })
      .limit(6),
    supabase
      .from('iadmin_payments')
      .select('amount, is_void, liquidation_run_id')
      .eq('managed_property_id', parsed.propertyId)
      .eq('is_void', false),
  ])

  const expenses = expensesRes.data ?? []
  const cashAccounts = cashRes.data ?? []
  const runs = runsRes.data ?? []
  const payments = paymentsRes.data ?? []

  // Saldo de cuentas activas (sumando movimientos)
  let currentBalance = 0
  if (cashAccounts.length > 0) {
    const activeIds = cashAccounts.filter((a) => a.is_active).map((a) => a.id)
    if (activeIds.length > 0) {
      const { data: moves } = await supabase
        .from('iadmin_bank_movements')
        .select('cash_account_id, amount')
        .in('cash_account_id', activeIds)
      currentBalance = (moves ?? []).reduce((s, m) => s + Number(m.amount), 0)
    }
  }

  // Tasa de cobranza histórica
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

  // Agregar gastos por mes para armar input
  const monthlyBuckets = new Map<string, { total: number; byCategory: Record<string, number> }>()
  for (const e of expenses) {
    if (!e.issued_at) continue
    const key = e.issued_at.slice(0, 7) // YYYY-MM
    const bucket = monthlyBuckets.get(key) ?? { total: 0, byCategory: {} }
    bucket.total += Number(e.amount)
    const cat = e.category ?? 'Otros'
    bucket.byCategory[cat] = (bucket.byCategory[cat] ?? 0) + Number(e.amount)
    monthlyBuckets.set(key, bucket)
  }

  // Ultimos 3 meses con categorias detalladas como input para la IA
  const monthlyHistory = Array.from(monthlyBuckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, b]) => ({
      month,
      total: Math.round(b.total),
      by_category: Object.fromEntries(
        Object.entries(b.byCategory).map(([k, v]) => [k, Math.round(v)]),
      ),
    }))

  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const nextLabel = `${String(nextMonth.getMonth() + 1).padStart(2, '0')}/${nextMonth.getFullYear()}`

  const contextJson = {
    property: propertyName,
    total_units: totalUnits,
    management_fee_pct: property.management_fee_pct,
    current_balance: Math.round(currentBalance),
    historical_collection_rate_pct: historicalRatePct,
    next_period_label: nextLabel,
    last_6_months: monthlyHistory,
    last_runs: runs.map((r) => {
      const p = Array.isArray(r.iadmin_accounting_periods)
        ? r.iadmin_accounting_periods[0]
        : r.iadmin_accounting_periods
      return {
        period: p ? `${String(p.period_month).padStart(2, '0')}/${p.period_year}` : '—',
        ordinary: Math.round(Number(r.ordinary_total ?? 0)),
        extraordinary: Math.round(Number(r.extraordinary_total ?? 0)),
      }
    }),
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
