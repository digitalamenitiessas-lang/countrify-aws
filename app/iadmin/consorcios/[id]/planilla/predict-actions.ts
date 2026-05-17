'use server'

import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { runAIChat, stripJsonFences } from '@/lib/iadmin/ai-chat'
import { upsertMonthlyCell, emitAndNotify, type EmitAndNotifyResult } from '@/app/iadmin/consorcios/[id]/planilla/actions'
import {
  getManagedPropertyForProjectionFromPostgres,
  listActiveProvidersForPredictionFromPostgres,
  listExpensesWithPeriodForPredictionFromPostgres,
} from '@/lib/db/iadmin-writes'

const predictSchema = z.object({
  propertyId: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
})

export type MonthPrediction = {
  providerId: string
  providerName: string
  suggestedAmount: number
  confidence: number
  reason: string
  lastAmount: number | null
  monthsWithData: number
}

export type GeneratePredictionsResult = {
  predictions: MonthPrediction[]
  model: string
  skipped: Array<{ providerName: string; reason: string }>
}

const SYSTEM_PROMPT = `Sos un analista financiero de consorcios argentinos. Predecis los gastos mensuales de cada rubro del consorcio basándote en el histórico proporcionado.

Considerá estos factores para cada predicción:
- Inflación implícita (detectala a partir del crecimiento mensual promedio).
- Estacionalidad (EDET sube en diciembre/enero por aire, gas sube en junio/julio por frío).
- Patrones de aumentos escalonados (sueldos suelen subir en marzo, julio, diciembre).
- Rubros fijos (cuotas de seguros, monotributos) varían poco.

Devolvés ÚNICAMENTE un JSON con este formato:

{
  "predictions": [
    {
      "providerId": "<el id que te pasaron>",
      "suggestedAmount": <numero entero en ARS sin decimales>,
      "confidence": <0-100>,
      "reason": "texto corto explicando tu criterio (max 120 chars)"
    }
  ]
}

Reglas:
- Si un rubro tiene <2 meses de historia, podés bajar confidence pero igual sugerir.
- Si el historial es muy errático (CV >30%), confidence <60.
- Si es fijo o con crecimiento lineal claro, confidence >85.
- Nunca devuelvas NaN ni negativos. Si no podés predecir, devolvé suggestedAmount igual al último valor conocido y confidence: 40.
- Redondeá a centenas (ej: 345.000, no 345.678).
- Incluí TODOS los rubros que te paso en el contexto.
- Solo JSON, sin markdown ni comentarios.`

export async function generateMonthPredictions(
  input: z.input<typeof predictSchema>,
): Promise<GeneratePredictionsResult> {
  const parsed = predictSchema.parse(input)

  const property = await getManagedPropertyForProjectionFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  await requireIAdmin({
    capability: 'expenses.create',
    administrationId: property.administration_id,
  })

  const propertyName = property.display_name ?? property.building_name ?? 'Consorcio'

  const providers = await listActiveProvidersForPredictionFromPostgres(property.administration_id)
  const fromDate = new Date(parsed.year, parsed.month - 13, 1).toISOString().slice(0, 10)
  const expenses = await listExpensesWithPeriodForPredictionFromPostgres({
    managedPropertyId: parsed.propertyId,
    fromDate,
  })

  type Row = { providerId: string; name: string; monthly: Array<{ year: number; month: number; amount: number }> }
  const byProvider = new Map<string, Row>()
  const providerById = new Map<string, (typeof providers)[number]>()
  for (const p of providers) providerById.set(p.id, p)

  for (const e of expenses) {
    if (!e.provider_id) continue
    if (!e.period_year || !e.period_month) continue
    const row = byProvider.get(e.provider_id) ?? {
      providerId: e.provider_id,
      name: providerById.get(e.provider_id)?.name ?? 'Proveedor',
      monthly: [],
    }
    row.monthly.push({ year: e.period_year, month: e.period_month, amount: Number(e.amount) })
    byProvider.set(e.provider_id, row)
  }

  type ProviderContext = {
    providerId: string
    providerName: string
    category: string | null
    history: Array<{ label: string; amount: number }>
    lastAmount: number | null
    monthsWithData: number
  }

  const candidateIds = new Set<string>()
  for (const p of providers) {
    if (p.is_recurring) candidateIds.add(p.id)
  }
  for (const id of byProvider.keys()) candidateIds.add(id)

  const contexts: ProviderContext[] = []
  const skipped: Array<{ providerName: string; reason: string }> = []

  for (const id of candidateIds) {
    const p = providerById.get(id)
    if (!p) continue
    const row = byProvider.get(id)
    const monthMap = new Map<string, number>()
    for (const m of row?.monthly ?? []) {
      const k = `${m.year}-${String(m.month).padStart(2, '0')}`
      monthMap.set(k, (monthMap.get(k) ?? 0) + m.amount)
    }
    const history = Array.from(monthMap.entries())
      .map(([k, v]) => ({ label: k, amount: Math.round(v) }))
      .sort((a, b) => a.label.localeCompare(b.label))

    if (history.length === 0 && !p.is_recurring) {
      skipped.push({ providerName: p.name, reason: 'sin historial y no es recurrente' })
      continue
    }

    contexts.push({
      providerId: id,
      providerName: p.name,
      category: p.default_category ?? null,
      history: history.slice(-6),
      lastAmount: history.length > 0 ? history[history.length - 1].amount : null,
      monthsWithData: history.length,
    })
  }

  if (contexts.length === 0) {
    return { predictions: [], model: '', skipped }
  }

  const targetLabel = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`
  const userPrompt = `Consorcio: ${propertyName}
Mes a predecir: ${targetLabel}

Rubros (con histórico):
${JSON.stringify(contexts, null, 2)}

Devolvé predicciones para TODOS los rubros listados.`

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
    throw new Error('La IA devolvió un formato inválido')
  }

  const resultSchema = z.object({
    predictions: z.array(
      z.object({
        providerId: z.string(),
        suggestedAmount: z.number(),
        confidence: z.number().min(0).max(100),
        reason: z.string().max(200),
      }),
    ),
  })

  const result = resultSchema.safeParse(parsedJson)
  if (!result.success) {
    throw new Error('Respuesta IA incompleta: ' + result.error.message)
  }

  const predictions: MonthPrediction[] = []
  for (const pred of result.data.predictions) {
    const ctx = contexts.find((c) => c.providerId === pred.providerId)
    if (!ctx) continue
    predictions.push({
      providerId: pred.providerId,
      providerName: ctx.providerName,
      suggestedAmount: Math.max(0, Math.round(pred.suggestedAmount)),
      confidence: Math.round(pred.confidence),
      reason: pred.reason,
      lastAmount: ctx.lastAmount,
      monthsWithData: ctx.monthsWithData,
    })
  }

  return {
    predictions,
    model: process.env.IADMIN_AI_MODEL ?? 'anthropic/claude-3.5-haiku',
    skipped,
  }
}

const acceptAndEmitSchema = z.object({
  propertyId: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  acceptedPredictions: z.array(
    z.object({
      providerId: z.string().uuid(),
      amount: z.number().nonnegative(),
    }),
  ),
})

export type AcceptAndEmitResult = {
  applied: number
  skipped: Array<{ providerId: string; reason: string }>
  emit: EmitAndNotifyResult
}

export async function acceptPredictionsAndEmit(
  input: z.input<typeof acceptAndEmitSchema>,
): Promise<AcceptAndEmitResult> {
  const parsed = acceptAndEmitSchema.parse(input)

  let applied = 0
  const skipped: Array<{ providerId: string; reason: string }> = []

  for (const pred of parsed.acceptedPredictions) {
    try {
      await upsertMonthlyCell({
        propertyId: parsed.propertyId,
        providerId: pred.providerId,
        year: parsed.year,
        month: parsed.month,
        amount: pred.amount,
      })
      applied += 1
    } catch (error) {
      skipped.push({
        providerId: pred.providerId,
        reason: error instanceof Error ? error.message : 'Error',
      })
    }
  }

  const emit = await emitAndNotify({
    propertyId: parsed.propertyId,
    year: parsed.year,
    month: parsed.month,
  })

  return { applied, skipped, emit }
}
