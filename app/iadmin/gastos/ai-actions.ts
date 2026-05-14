'use server'

import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { runAIExtraction, type AIExtractionResult } from '@/lib/iadmin/ai-extractor'
import { detectExpenseAnomalies, type ExpenseAnomaly } from '@/lib/iadmin/expense-anomalies'

const extractSchema = z.object({
  administrationId: z.string().uuid(),
  managedPropertyId: z.string().uuid().optional(),
  fileBase64: z.string().min(100),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
})

export type ExtractExpenseFromFileInput = z.input<typeof extractSchema>

export type ExtractExpenseFromFileResult = {
  suggestion: AIExtractionResult
  model: string
  anomalies: ExpenseAnomaly[]
}

/**
 * Toma un archivo ya leido en base64 (lado cliente), lo manda a la IA y
 * devuelve los campos extraidos. No persiste nada. El cliente usa el
 * resultado para pre-llenar el form de alta de gasto.
 */
export async function extractExpenseFromFile(
  input: ExtractExpenseFromFileInput,
): Promise<ExtractExpenseFromFileResult> {
  const parsed = extractSchema.parse(input)
  await requireIAdmin({
    capability: 'documents.upload',
    administrationId: parsed.administrationId,
  })

  const suggestion = await runAIExtraction({
    fileBase64: parsed.fileBase64,
    mimeType: parsed.mimeType,
    fileName: parsed.fileName,
  })

  let anomalies: ExpenseAnomaly[] = []
  if (parsed.managedPropertyId && suggestion.amount) {
    try {
      anomalies = await detectExpenseAnomalies({
        managedPropertyId: parsed.managedPropertyId,
        providerName: suggestion.provider_name ?? null,
        amount: Number(suggestion.amount),
        issuedAt: suggestion.issued_at ?? null,
      })
    } catch {
      // no es critico si falla el analisis
    }
  }

  return {
    suggestion,
    model: process.env.IADMIN_AI_MODEL || 'anthropic/claude-3.5-haiku',
    anomalies,
  }
}

const anomalyCheckSchema = z.object({
  administrationId: z.string().uuid(),
  managedPropertyId: z.string().uuid(),
  providerName: z.string().trim().optional(),
  providerId: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/**
 * Chequeo de anomalias a demanda (por ejemplo cuando el admin carga un gasto
 * manualmente sin pasar por la IA). Devuelve las mismas anomalias que el extract.
 */
export async function checkExpenseAnomalies(
  input: z.input<typeof anomalyCheckSchema>,
): Promise<ExpenseAnomaly[]> {
  const parsed = anomalyCheckSchema.parse(input)
  await requireIAdmin({
    capability: 'expenses.create',
    administrationId: parsed.administrationId,
  })

  return detectExpenseAnomalies({
    managedPropertyId: parsed.managedPropertyId,
    providerName: parsed.providerName ?? null,
    providerId: parsed.providerId ?? null,
    amount: parsed.amount,
    issuedAt: parsed.issuedAt,
  })
}
