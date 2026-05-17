'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { findMembership, requireIAdmin } from '@/lib/auth'
import {
  buildExpenseDocumentObjectKey,
  createPrivateS3DownloadUrl,
  deleteObjectFromS3,
  uploadBufferToS3,
} from '@/lib/aws/s3'
import { canTransition } from '@/lib/iadmin/expense-status'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  changeExpenseStatusInPostgres,
  ensureAccountingPeriodInPostgres,
  findProviderByNameInPostgres,
  getAIExtractionWithAdminFromPostgres,
  getExpenseDocumentWithAdminFromPostgres,
  getExpenseStatusInfoFromPostgres,
  getManagedPropertyAdminIdFromPostgres,
  insertAIExtractionInPostgres,
  insertExpenseDocumentInPostgres,
  insertExpenseInPostgres,
  insertProviderQuickFromPostgres,
  setProviderDefaultCategoryIfNullInPostgres,
  updateAIExtractionDecisionInPostgres,
} from '@/lib/db/iadmin-writes'
import type { IAdminCapability, IAdminExpenseStatus } from '@/lib/types'

const createExpenseSchema = z.object({
  administrationId: z.string().uuid(),
  managedPropertyId: z.string().uuid(),
  accountingPeriodId: z.string().uuid().nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  providerName: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().min(1).max(240),
  amount: z.number().nonnegative(),
  currency: z.string().trim().min(1).max(8).default('ARS'),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expenseKind: z.enum(['ordinaria', 'extraordinaria']).optional().default('ordinaria'),
  autoImpute: z.boolean().optional().default(true),
  draftDocument: z.object({
    fileBase64: z.string().min(100),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative().optional(),
    aiSuggestedFields: z.record(z.unknown()).optional(),
    aiConfidence: z.number().min(0).max(100).optional(),
    aiProvider: z.string().optional(),
  }).optional(),
})

export type CreateExpenseInput = z.input<typeof createExpenseSchema>

export async function createExpense(input: CreateExpenseInput) {
  const parsed = createExpenseSchema.parse(input)
  const { profile, context } = await requireIAdmin({
    capability: 'expenses.create',
    administrationId: parsed.administrationId,
  })

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.managedPropertyId)
  if (!property || property.administration_id !== parsed.administrationId) {
    throw new Error('Consorcio fuera de la administracion')
  }

  let providerId = parsed.providerId ?? null
  if (!providerId && parsed.providerName && parsed.providerName.trim().length > 0) {
    const existing = await findProviderByNameInPostgres({
      administrationId: parsed.administrationId,
      name: parsed.providerName.trim(),
    })
    if (existing) {
      providerId = existing.id
    } else {
      const created = await insertProviderQuickFromPostgres({
        administrationId: parsed.administrationId,
        name: parsed.providerName.trim(),
        category: parsed.category ?? null,
      })
      providerId = created.id
    }
  } else if (providerId && parsed.category) {
    await setProviderDefaultCategoryIfNullInPostgres({ providerId, category: parsed.category })
  }

  let accountingPeriodId = parsed.accountingPeriodId ?? null
  if (!accountingPeriodId) {
    const now = new Date()
    const period = await ensureAccountingPeriodInPostgres({
      managedPropertyId: parsed.managedPropertyId,
      periodYear: now.getFullYear(),
      periodMonth: now.getMonth() + 1,
    })
    accountingPeriodId = period.id
  }

  const canApprove =
    context.isSuperAdmin ||
    (context.memberships
      .find((m) => m.administration.id === parsed.administrationId)
      ?.capabilities.includes('expenses.approve') ?? false)
  const initialStatus: IAdminExpenseStatus = parsed.autoImpute && canApprove ? 'imputed' : 'pending_review'

  const created = await insertExpenseInPostgres({
    administrationId: parsed.administrationId,
    managedPropertyId: parsed.managedPropertyId,
    accountingPeriodId,
    providerId,
    category: parsed.category ?? null,
    description: parsed.description,
    amount: parsed.amount,
    currency: parsed.currency,
    issuedAt: parsed.issuedAt ?? null,
    dueAt: parsed.dueAt ?? null,
    status: initialStatus,
    expenseKind: parsed.expenseKind ?? 'ordinaria',
    createdBy: profile.id,
    approvedBy: initialStatus === 'imputed' ? profile.id : null,
  })

  if (parsed.draftDocument) {
    try {
      const storagePath = buildExpenseDocumentObjectKey(
        parsed.administrationId,
        created.id,
        parsed.draftDocument.fileName,
      )
      const base64 = parsed.draftDocument.fileBase64.replace(/^data:[^;]+;base64,/, '')
      const bin = Buffer.from(base64, 'base64')

      await uploadBufferToS3({
        objectKey: storagePath,
        body: bin,
        contentType: parsed.draftDocument.mimeType,
      })

      try {
        const docRow = await insertExpenseDocumentInPostgres({
          expenseId: created.id,
          storagePath,
          fileName: parsed.draftDocument.fileName,
          mimeType: parsed.draftDocument.mimeType,
          sizeBytes: parsed.draftDocument.sizeBytes ?? bin.length,
          uploadedBy: profile.id,
        })
        await insertAIExtractionInPostgres({
          documentId: docRow.id,
          status: 'validated',
          provider: parsed.draftDocument.aiProvider ?? 'openrouter',
          suggestedFields: parsed.draftDocument.aiSuggestedFields ?? {},
          confidence: parsed.draftDocument.aiConfidence ?? null,
          validatedBy: profile.id,
        })
      } catch {
        await deleteObjectFromS3(storagePath).catch(() => undefined)
      }
    } catch (docErr) {
      await insertIAdminAuditLogInPostgres({
        administrationId: parsed.administrationId,
        actorProfileId: profile.id,
        entityType: 'iadmin_expenses',
        entityId: created.id,
        action: 'expense.doc_upload_failed',
        metadata: { error: docErr instanceof Error ? docErr.message : String(docErr) },
      })
    }
  }

  await insertIAdminAuditLogInPostgres({
    administrationId: parsed.administrationId,
    actorProfileId: profile.id,
    entityType: 'iadmin_expenses',
    entityId: created.id,
    action: initialStatus === 'imputed' ? 'expense.created_and_imputed' : 'expense.created',
    metadata: {
      amount: parsed.amount,
      currency: parsed.currency,
      status: initialStatus,
      has_ai_doc: Boolean(parsed.draftDocument),
    },
  })

  revalidatePath('/iadmin/gastos')
  revalidatePath('/iadmin/cartera')
  revalidatePath(`/iadmin/consorcios/${parsed.managedPropertyId}`)
  return { id: created.id, status: initialStatus }
}

const changeStatusSchema = z.object({
  expenseId: z.string().uuid(),
  nextStatus: z.enum(['draft', 'pending_review', 'needs_doc', 'approved', 'rejected', 'imputed']),
  note: z.string().trim().max(500).optional(),
})

export async function changeExpenseStatus(input: z.input<typeof changeStatusSchema>) {
  const parsed = changeStatusSchema.parse(input)
  const { profile, context } = await requireIAdmin({ capability: 'expenses.view' })

  const expense = await getExpenseStatusInfoFromPostgres(parsed.expenseId)
  if (!expense) throw new Error('Gasto no encontrado')

  if (!context.isSuperAdmin) {
    const membership = findMembership(context, expense.administration_id)
    const capabilities: ReadonlySet<IAdminCapability> = new Set(membership?.capabilities ?? [])
    if (!canTransition(expense.status as any, parsed.nextStatus, capabilities)) {
      throw new Error('Transicion no permitida para tu rol')
    }
  }

  await changeExpenseStatusInPostgres({
    expenseId: parsed.expenseId,
    nextStatus: parsed.nextStatus,
    approvedBy: parsed.nextStatus === 'approved' ? profile.id : null,
    rejectedReason: parsed.nextStatus === 'rejected' ? parsed.note ?? null : null,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: expense.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_expenses',
    entityId: parsed.expenseId,
    action: `expense.${parsed.nextStatus}`,
    metadata: parsed.note ? { note: parsed.note } : null,
  })

  revalidatePath('/iadmin/gastos')
  revalidatePath(`/iadmin/gastos/${parsed.expenseId}`)
}

const attachDocumentSchema = z.object({
  expenseId: z.string().uuid(),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
})

export async function attachExpenseDocument(input: z.input<typeof attachDocumentSchema>) {
  const parsed = attachDocumentSchema.parse(input)
  const { profile } = await requireIAdmin({ capability: 'documents.upload' })

  const expense = await getExpenseStatusInfoFromPostgres(parsed.expenseId)
  if (!expense) throw new Error('Gasto no encontrado')

  const doc = await insertExpenseDocumentInPostgres({
    expenseId: parsed.expenseId,
    storagePath: parsed.storagePath,
    fileName: parsed.fileName,
    mimeType: parsed.mimeType ?? null,
    sizeBytes: parsed.sizeBytes ?? null,
    uploadedBy: profile.id,
  })

  await insertAIExtractionInPostgres({
    documentId: doc.id,
    status: 'pending',
    provider: 'manual',
    suggestedFields: {},
    confidence: null,
  })

  if (expense.status === 'needs_doc') {
    await changeExpenseStatusInPostgres({
      expenseId: parsed.expenseId,
      nextStatus: 'pending_review',
      approvedBy: null,
      rejectedReason: null,
    })
  }

  await insertIAdminAuditLogInPostgres({
    administrationId: expense.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_expense_documents',
    entityId: doc.id,
    action: 'document.attached',
    metadata: { file_name: parsed.fileName },
  })

  revalidatePath(`/iadmin/gastos/${parsed.expenseId}`)
  return { id: doc.id }
}

const signedDocSchema = z.object({
  documentId: z.string().uuid(),
})

export async function getExpenseDocumentSignedUrl(
  input: z.input<typeof signedDocSchema>,
): Promise<{ url: string; fileName: string }> {
  const parsed = signedDocSchema.parse(input)
  const { profile, context } = await requireIAdmin({ capability: 'expenses.view' })

  const doc = await getExpenseDocumentWithAdminFromPostgres(parsed.documentId)
  if (!doc) throw new Error('Documento no encontrado')

  const canView =
    context.isSuperAdmin ||
    context.memberships.some(
      (membership) =>
        membership.administration.id === doc.administration_id &&
        membership.capabilities.includes('expenses.view'),
    )

  if (!canView && profile.role !== 'super_admin') {
    throw new Error('No autorizado para ver este comprobante')
  }

  return {
    url: await createPrivateS3DownloadUrl(doc.storage_path, doc.file_name ?? undefined),
    fileName: doc.file_name ?? 'documento',
  }
}

const validateExtractionSchema = z.object({
  extractionId: z.string().uuid(),
  decision: z.enum(['validated', 'rejected']),
  notes: z.string().trim().max(500).optional(),
})

export async function validateAIExtraction(input: z.input<typeof validateExtractionSchema>) {
  const parsed = validateExtractionSchema.parse(input)
  const { profile } = await requireIAdmin({ capability: 'documents.validate' })

  const extraction = await getAIExtractionWithAdminFromPostgres(parsed.extractionId)
  if (!extraction) throw new Error('Extraccion no encontrada')

  await updateAIExtractionDecisionInPostgres({
    extractionId: parsed.extractionId,
    decision: parsed.decision,
    validatedBy: profile.id,
    validationNotes: parsed.notes ?? null,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: extraction.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_ai_document_extractions',
    entityId: parsed.extractionId,
    action: `extraction.${parsed.decision}`,
    metadata: parsed.notes ? { notes: parsed.notes } : null,
  })

  revalidatePath(`/iadmin/gastos/${extraction.expense_id}`)
}
