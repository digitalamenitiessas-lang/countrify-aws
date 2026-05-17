'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { can, requireIAdmin } from '@/lib/auth'
import {
  buildExpenseDocumentObjectKey,
  deleteObjectFromS3,
  uploadBufferToS3,
} from '@/lib/aws/s3'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  getAccountingPeriodIdAndStatusFromPostgres,
  getManagedPropertyAdminIdFromPostgres,
  getProviderExactByNameForAdminFromPostgres,
  getProviderForAdminFromPostgres,
  insertAIExtractionInPostgres,
  insertExpenseDocumentInPostgres,
  insertExpenseInPostgres,
  insertProviderQuickFromPostgres,
  listExpensesForDuplicateCheckFromPostgres,
  listProfileNamesByIdsFromPostgres,
  listProvidersFuzzyByTokensFromPostgres,
  ensureAccountingPeriodInPostgres,
} from '@/lib/db/iadmin-writes'
import type { IAdminExpenseStatus } from '@/lib/types'

const matchSchema = z.object({
  administrationId: z.string().uuid(),
  providerName: z.string().trim().min(1).max(120),
})

export type ProviderMatchCandidate = {
  id: string
  name: string
  category: string | null
  isRecurring: boolean
  recurringKind: 'ordinaria' | 'extraordinaria' | null
}

export type ProviderMatchResult = {
  exact: ProviderMatchCandidate | null
  candidates: ProviderMatchCandidate[]
}

export async function suggestProviderMatch(
  input: z.input<typeof matchSchema>,
): Promise<ProviderMatchResult> {
  const parsed = matchSchema.parse(input)
  await requireIAdmin({
    capability: 'expenses.create',
    administrationId: parsed.administrationId,
  })

  const name = parsed.providerName.trim()

  const exact = await getProviderExactByNameForAdminFromPostgres({
    administrationId: parsed.administrationId,
    name,
  })

  const tokens = name
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, '').trim())
    .filter((t) => t.length >= 3)

  const fuzzy = await listProvidersFuzzyByTokensFromPostgres({
    administrationId: parsed.administrationId,
    tokens,
    limit: 8,
  })

  const candidates: ProviderMatchCandidate[] = fuzzy
    .filter((p) => !exact || p.id !== exact.id)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.default_category ?? p.category,
      isRecurring: Boolean(p.is_recurring),
      recurringKind: (p.recurring_kind as 'ordinaria' | 'extraordinaria' | null) ?? null,
    }))

  return {
    exact: exact
      ? {
          id: exact.id,
          name: exact.name,
          category: exact.default_category ?? exact.category,
          isRecurring: Boolean(exact.is_recurring),
          recurringKind: (exact.recurring_kind as 'ordinaria' | 'extraordinaria' | null) ?? null,
        }
      : null,
    candidates,
  }
}

const importSchema = z.object({
  propertyId: z.string().uuid(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  providerId: z.string().uuid().nullable().optional(),
  providerName: z.string().trim().max(120).optional(),
  createProviderIfMissing: z.boolean().optional().default(false),
  amount: z.number().positive(),
  description: z.string().trim().max(240).optional(),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expenseKind: z.enum(['ordinaria', 'extraordinaria']).optional().default('ordinaria'),
  category: z.string().trim().max(80).nullable().optional(),
  ackDuplicateIds: z.array(z.string().uuid()).max(10).optional(),
  file: z
    .object({
      fileBase64: z.string().min(100),
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      sizeBytes: z.number().int().nonnegative().optional(),
      aiSuggestedFields: z.record(z.unknown()).optional(),
      aiConfidence: z.number().min(0).max(100).optional(),
      aiProvider: z.string().optional(),
    })
    .optional(),
})

export type ImportExpenseInput = z.input<typeof importSchema>

export type ImportExpenseResult = {
  expenseId: string
  providerId: string | null
  providerName: string | null
  providerCreated: boolean
  periodId: string
  status: IAdminExpenseStatus
  imputed: boolean
  documentId: string | null
}

export async function importExpenseFromExtraction(
  input: ImportExpenseInput,
): Promise<ImportExpenseResult> {
  const parsed = importSchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')
  const administrationId = property.administration_id

  const { profile, context } = await requireIAdmin({
    capability: 'expenses.create',
    administrationId,
  })

  let providerId = parsed.providerId ?? null
  let providerName = ''
  let providerCreated = false

  if (providerId) {
    const existing = await getProviderForAdminFromPostgres({ providerId, administrationId })
    if (!existing) throw new Error('Proveedor no pertenece a esta administración')
    providerName = existing.name
  } else if (parsed.providerName && parsed.providerName.trim().length > 0) {
    const name = parsed.providerName.trim()
    const existing = await getProviderExactByNameForAdminFromPostgres({
      administrationId,
      name,
    })
    if (existing) {
      providerId = existing.id
      providerName = existing.name
    } else if (parsed.createProviderIfMissing) {
      if (!can(context, 'providers.manage', { administrationId })) {
        throw new Error('No tenés permiso para crear proveedores nuevos')
      }
      const created = await insertProviderQuickFromPostgres({
        administrationId,
        name,
        category: parsed.category ?? null,
      })
      providerId = created.id
      providerName = name
      providerCreated = true
    } else {
      throw new Error(`Proveedor "${name}" no existe. Confirmá la creación o elegí uno existente.`)
    }
  }

  const existingPeriod = await getAccountingPeriodIdAndStatusFromPostgres({
    managedPropertyId: parsed.propertyId,
    periodYear: parsed.year,
    periodMonth: parsed.month,
  })
  let periodId: string
  if (existingPeriod) {
    if (existingPeriod.status === 'closed') {
      throw new Error(`El período ${parsed.month}/${parsed.year} está cerrado; no se pueden imputar gastos.`)
    }
    periodId = existingPeriod.id
  } else {
    const created = await ensureAccountingPeriodInPostgres({
      managedPropertyId: parsed.propertyId,
      periodYear: parsed.year,
      periodMonth: parsed.month,
    })
    periodId = created.id
  }

  const canApprove = can(context, 'expenses.approve', { administrationId })
  const initialStatus: IAdminExpenseStatus = canApprove ? 'imputed' : 'pending_review'

  const description =
    parsed.description?.trim() ||
    (providerName ? `Factura ${providerName}` : 'Gasto importado')

  const expenseRow = await insertExpenseInPostgres({
    administrationId,
    managedPropertyId: parsed.propertyId,
    accountingPeriodId: periodId,
    providerId,
    category: parsed.category ?? null,
    description,
    amount: parsed.amount,
    currency: 'ARS',
    issuedAt: parsed.issuedAt ?? null,
    dueAt: parsed.dueAt ?? null,
    status: initialStatus,
    expenseKind: parsed.expenseKind ?? 'ordinaria',
    createdBy: profile.id,
    approvedBy: initialStatus === 'imputed' ? profile.id : null,
  })
  const expenseId = expenseRow.id

  let documentId: string | null = null
  if (parsed.file) {
    try {
      const storagePath = buildExpenseDocumentObjectKey(
        administrationId,
        expenseId,
        parsed.file.fileName,
      )
      const base64 = parsed.file.fileBase64.replace(/^data:[^;]+;base64,/, '')
      const bin = Buffer.from(base64, 'base64')

      await uploadBufferToS3({
        objectKey: storagePath,
        body: bin,
        contentType: parsed.file.mimeType,
      })

      try {
        const docRow = await insertExpenseDocumentInPostgres({
          expenseId,
          storagePath,
          fileName: parsed.file.fileName,
          mimeType: parsed.file.mimeType,
          sizeBytes: parsed.file.sizeBytes ?? bin.length,
          uploadedBy: profile.id,
        })
        documentId = docRow.id
        await insertAIExtractionInPostgres({
          documentId: docRow.id,
          status: 'validated',
          provider: parsed.file.aiProvider ?? 'openrouter',
          suggestedFields: parsed.file.aiSuggestedFields ?? {},
          confidence: parsed.file.aiConfidence ?? null,
          validatedBy: profile.id,
        })
      } catch {
        await deleteObjectFromS3(storagePath).catch(() => undefined)
      }
    } catch (docErr) {
      await insertIAdminAuditLogInPostgres({
        administrationId,
        actorProfileId: profile.id,
        entityType: 'iadmin_expenses',
        entityId: expenseId,
        action: 'expense.doc_upload_failed',
        metadata: { error: docErr instanceof Error ? docErr.message : String(docErr) },
      })
    }
  }

  await insertIAdminAuditLogInPostgres({
    administrationId,
    actorProfileId: profile.id,
    entityType: 'iadmin_expenses',
    entityId: expenseId,
    action: initialStatus === 'imputed' ? 'expense.imported_and_imputed' : 'expense.imported',
    metadata: {
      source: 'mesa-assistant-extraction',
      period: `${parsed.month}/${parsed.year}`,
      providerCreated,
      providerName,
      duplicateOverride:
        parsed.ackDuplicateIds && parsed.ackDuplicateIds.length > 0
          ? { acknowledgedIds: parsed.ackDuplicateIds }
          : undefined,
    },
  })

  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)

  return {
    expenseId,
    providerId,
    providerName: providerName || null,
    providerCreated,
    periodId,
    status: initialStatus,
    imputed: initialStatus === 'imputed',
    documentId,
  }
}

const duplicateSchema = z.object({
  propertyId: z.string().uuid(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  providerId: z.string().uuid().nullable().optional(),
  providerName: z.string().trim().max(120).optional(),
  amount: z.number().positive().nullable().optional(),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

export type DuplicateCandidate = {
  id: string
  amount: number
  description: string | null
  issuedAt: string | null
  createdAt: string | null
  createdByName: string | null
  status: IAdminExpenseStatus
  hasDocument: boolean
  similarity: number
  reasons: string[]
}

export type DuplicateCheckResult = {
  duplicates: DuplicateCandidate[]
  hasExact: boolean
  hasSameIssuedAt: boolean
}

export async function checkExpenseDuplicate(
  input: z.input<typeof duplicateSchema>,
): Promise<DuplicateCheckResult> {
  const parsed = duplicateSchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')
  const administrationId = property.administration_id

  await requireIAdmin({
    capability: 'expenses.view',
    administrationId,
  })

  let providerId = parsed.providerId ?? null
  if (!providerId && parsed.providerName && parsed.providerName.trim().length > 0) {
    const existing = await getProviderExactByNameForAdminFromPostgres({
      administrationId,
      name: parsed.providerName.trim(),
    })
    providerId = existing?.id ?? null
  }
  if (!providerId) {
    return { duplicates: [], hasExact: false, hasSameIssuedAt: false }
  }

  const period = await getAccountingPeriodIdAndStatusFromPostgres({
    managedPropertyId: parsed.propertyId,
    periodYear: parsed.year,
    periodMonth: parsed.month,
  })
  if (!period) {
    return { duplicates: [], hasExact: false, hasSameIssuedAt: false }
  }

  const expenses = await listExpensesForDuplicateCheckFromPostgres({
    managedPropertyId: parsed.propertyId,
    providerId,
    accountingPeriodId: period.id,
  })

  if (expenses.length === 0) {
    return { duplicates: [], hasExact: false, hasSameIssuedAt: false }
  }

  const createdByIds = Array.from(
    new Set(expenses.map((e) => e.created_by).filter((x): x is string => Boolean(x))),
  )
  const profileNameById = await listProfileNamesByIdsFromPostgres(createdByIds)

  const amountRef = parsed.amount ?? null
  const issuedAtRef = parsed.issuedAt ?? null
  let hasExact = false
  let hasSameIssuedAt = false

  const candidates: DuplicateCandidate[] = expenses.map((e) => {
    const reasons: string[] = []
    let similarity = 40
    const amount = Number(e.amount)
    const issuedAt = e.issued_at

    if (amountRef !== null) {
      const delta = Math.abs(amount - amountRef) / Math.max(amountRef, 1)
      if (delta < 0.005) {
        similarity += 50
        reasons.push('mismo monto')
        hasExact = true
      } else if (delta < 0.02) {
        similarity += 35
        reasons.push(`monto casi idéntico (±${(delta * 100).toFixed(1)}%)`)
      } else if (delta < 0.1) {
        similarity += 10
        reasons.push(`monto similar (±${(delta * 100).toFixed(0)}%)`)
      }
    }

    if (issuedAtRef && issuedAt && issuedAt === issuedAtRef) {
      similarity += 30
      reasons.push('misma fecha de emisión')
      hasSameIssuedAt = true
    }

    return {
      id: e.id,
      amount,
      description: e.description,
      issuedAt,
      createdAt: e.created_at,
      createdByName: e.created_by ? profileNameById.get(e.created_by) ?? null : null,
      status: e.status as IAdminExpenseStatus,
      hasDocument: e.has_document,
      similarity: Math.min(100, similarity),
      reasons,
    }
  })

  const duplicates = candidates
    .filter((c) => c.similarity >= 50)
    .sort((a, b) => b.similarity - a.similarity)

  return {
    duplicates,
    hasExact,
    hasSameIssuedAt,
  }
}
