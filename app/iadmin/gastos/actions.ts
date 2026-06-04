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
import { assertSufficientFunds } from '@/lib/iadmin/cash-guards'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import { pgQuery } from '@/lib/db/postgres'
import {
  assertProrataNotOver100,
  changeExpenseStatusInPostgres,
  deleteExpenseFromPostgres,
  deleteExpensesForPeriodFromPostgres,
  ensureAccountingPeriodInPostgres,
  existingExpensePaymentMovementInPostgres,
  findProviderByNameInPostgres,
  getCashAccountWithAdminFromPostgres,
  insertBankMovementInPostgres,
  getAccountingPeriodIdAndStatusFromPostgres,
  getAIExtractionWithAdminFromPostgres,
  getExpenseDocumentWithAdminFromPostgres,
  getExpenseEditContextFromPostgres,
  getExpenseStatusInfoFromPostgres,
  getManagedPropertyAdminIdFromPostgres,
  insertAIExtractionInPostgres,
  insertExpenseDocumentInPostgres,
  insertExpenseInPostgres,
  insertProviderQuickFromPostgres,
  listExpensesForPeriodFromPostgres,
  setProviderDefaultCategoryIfNullInPostgres,
  updateAIExtractionDecisionInPostgres,
  updateExpenseInPostgres,
} from '@/lib/db/iadmin-writes'
import type { IAdminCapability, IAdminExpenseStatus } from '@/lib/types'

const createExpenseSchema = z.object({
  administrationId: z.string().uuid(),
  managedPropertyId: z.string().uuid(),
  accountingPeriodId: z.string().uuid().nullable().optional(),
  // El periodo (mes/año) al que se imputa el gasto. Si no se manda, el server
  // usa el mes actual. La fecha de emision (issuedAt) es independiente — un
  // gasto se puede imputar a junio aunque la factura sea de mayo, por ejemplo.
  periodYear: z.number().int().min(2020).max(2100).optional(),
  periodMonth: z.number().int().min(1).max(12).optional(),
  providerId: z.string().uuid().nullable().optional(),
  providerName: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().min(1).max(240),
  amount: z.number().nonnegative(),
  currency: z.string().trim().min(1).max(8).default('ARS'),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expenseKind: z.enum(['ordinaria', 'extraordinaria']).optional().default('ordinaria'),
  // Gasto particular: si se manda, el gasto va entero a esta unidad (no se
  // prorratea). null/ausente = gasto común prorrateado.
  unitId: z.string().uuid().nullable().optional(),
  // Comprobante (tipo + número) para el detalle de egresos de la caja.
  documentType: z.string().trim().max(40).nullable().optional(),
  documentNumber: z.string().trim().max(40).nullable().optional(),
  // Pago del gasto: si se elige una cuenta, registramos el egreso en esa cuenta
  // (movimiento expense_payment) para que la caja quede al día. Opcional: un
  // gasto puede cargarse sin pagar todavía.
  cashAccountId: z.string().uuid().nullable().optional(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  // Si el pago dejaría la cuenta en negativo, por defecto se bloquea. El usuario
  // puede forzar el egreso marcando "permitir saldo negativo" en el formulario.
  allowOverdraft: z.boolean().optional().default(false),
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

export type CreateExpenseResult =
  | { ok: true; id: string; status: IAdminExpenseStatus }
  | { ok: false; error: string; code?: string }

/**
 * Wrapper público de la action. Envuelve `createExpenseImpl` para devolver los
 * errores de negocio como objeto. Si tirábamos throw, Next.js en producción los
 * reemplaza por "An error occurred in the Server Components render. ..." y el
 * usuario nunca ve el mensaje real (período cerrado, alícuota > 100%, etc.).
 */
export async function createExpense(input: CreateExpenseInput): Promise<CreateExpenseResult> {
  try {
    const result = await createExpenseImpl(input)
    return { ok: true, ...result }
  } catch (error) {
    if (error instanceof Error) {
      const code = (error as Error & { code?: string }).code
      // Log server-side para no perder el stack; el cliente ve solo el mensaje.
      console.error('[createExpense] business error:', error.message, code ? `(code=${code})` : '')
      return { ok: false, error: error.message, code }
    }
    console.error('[createExpense] unknown error:', error)
    return { ok: false, error: 'Error inesperado al cargar el gasto' }
  }
}

async function createExpenseImpl(input: CreateExpenseInput): Promise<{ id: string; status: IAdminExpenseStatus }> {
  const parsed = createExpenseSchema.parse(input)
  const { profile, context } = await requireIAdmin({
    capability: 'expenses.create',
    administrationId: parsed.administrationId,
  })

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.managedPropertyId)
  if (!property || property.administration_id !== parsed.administrationId) {
    throw new Error('Consorcio fuera de la administracion')
  }

  await assertProrataNotOver100(parsed.managedPropertyId)

  // Pago desde una cuenta: validamos ANTES de insertar el gasto que la cuenta
  // exista, pertenezca al consorcio y tenga saldo suficiente. Si quedaría en
  // negativo y no se pidió override, abortamos toda la carga (el form muestra
  // el error con código INSUFFICIENT_FUNDS y ofrece "permitir saldo negativo").
  if (parsed.cashAccountId) {
    const account = await getCashAccountWithAdminFromPostgres(parsed.cashAccountId)
    if (!account || account.managed_property_id !== parsed.managedPropertyId) {
      throw new Error('La cuenta de pago no pertenece a este consorcio')
    }
    await assertSufficientFunds({
      cashAccountId: parsed.cashAccountId,
      outgoingAmount: parsed.amount,
      allowOverdraft: parsed.allowOverdraft,
    })
  }

  // Gasto particular: validamos que la unidad pertenezca al consorcio.
  if (parsed.unitId) {
    const unitRes = await pgQuery<{ id: string }>(
      `select id from countrify.iadmin_units where id = $1 and managed_property_id = $2 limit 1`,
      [parsed.unitId, parsed.managedPropertyId],
    )
    if (!unitRes.rows[0]) {
      throw new Error('La unidad indicada no pertenece a este consorcio')
    }
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

  // Resolución del período: prioridad por accountingPeriodId, luego year/month
  // explícitos, finalmente el mes actual como default.
  let accountingPeriodId = parsed.accountingPeriodId ?? null
  let periodLabel = ''
  if (!accountingPeriodId) {
    const now = new Date()
    const year = parsed.periodYear ?? now.getFullYear()
    const month = parsed.periodMonth ?? now.getMonth() + 1
    periodLabel = `${String(month).padStart(2, '0')}/${year}`

    const existing = await getAccountingPeriodIdAndStatusFromPostgres({
      managedPropertyId: parsed.managedPropertyId,
      periodYear: year,
      periodMonth: month,
    })
    if (existing) {
      if (existing.status === 'closed') {
        throw new Error(
          `El periodo ${periodLabel} esta cerrado. Reabrilo desde Liquidaciones si necesitas cargar gastos retroactivos.`,
        )
      }
      accountingPeriodId = existing.id
    } else {
      const created = await ensureAccountingPeriodInPostgres({
        managedPropertyId: parsed.managedPropertyId,
        periodYear: year,
        periodMonth: month,
      })
      accountingPeriodId = created.id
    }
  } else {
    // Validamos que el período no esté cerrado aunque venga referenciado por id.
    const periodInfo = await pgQuery<{
      status: string
      period_year: number
      period_month: number
      managed_property_id: string
    }>(
      `select status::text as status, period_year, period_month, managed_property_id
         from countrify.iadmin_accounting_periods
        where id = $1
        limit 1`,
      [accountingPeriodId],
    )
    const info = periodInfo.rows[0]
    if (!info) throw new Error('El periodo indicado no existe')
    if (info.managed_property_id !== parsed.managedPropertyId) {
      throw new Error('El periodo no pertenece a este consorcio')
    }
    periodLabel = `${String(info.period_month).padStart(2, '0')}/${info.period_year}`
    if (info.status === 'closed') {
      throw new Error(`El periodo ${periodLabel} esta cerrado y no admite mas gastos.`)
    }
  }

  // Si ya hay una liquidación emitida o cerrada para este período, no se
  // pueden cargar más gastos sin reabrirla — sino se rompe el cálculo.
  const liqRes = await pgQuery<{ status: string }>(
    `select status::text as status
       from countrify.iadmin_liquidation_runs
      where managed_property_id = $1
        and accounting_period_id = $2
        and status in ('issued', 'closed')
      limit 1`,
    [parsed.managedPropertyId, accountingPeriodId],
  )
  if (liqRes.rows[0]) {
    const runStatus = liqRes.rows[0].status
    // Sentinela para que la UI pueda detectar este error puntual y mostrar
    // un banner con link a Liquidaciones en lugar de un toast genérico.
    const error = new Error(
      `Periodo ${periodLabel} ya ${runStatus === 'issued' ? 'liquidado' : 'cerrado'}. ` +
        `Reabrí la liquidación si necesitás cargar más gastos en ese mes.`,
    )
    ;(error as Error & { code?: string }).code = 'PERIOD_ALREADY_LIQUIDATED'
    throw error
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
    unitId: parsed.unitId ?? null,
    documentType: parsed.documentType ?? null,
    documentNumber: parsed.documentNumber ?? null,
    createdBy: profile.id,
    approvedBy: initialStatus === 'imputed' ? profile.id : null,
  })

  // Pago desde una cuenta: registramos el egreso en la caja (movimiento
  // expense_payment) para que el saldo de la cuenta quede al día. Es opcional;
  // si falla, no abortamos la carga del gasto (queda como "no pagado").
  if (parsed.cashAccountId) {
    try {
      const account = await getCashAccountWithAdminFromPostgres(parsed.cashAccountId)
      if (!account || account.managed_property_id !== parsed.managedPropertyId) {
        throw new Error('La cuenta de pago no pertenece a este consorcio')
      }
      if (await existingExpensePaymentMovementInPostgres(created.id)) {
        throw new Error('Este gasto ya tiene un pago registrado')
      }
      await insertBankMovementInPostgres({
        administrationId: parsed.administrationId,
        managedPropertyId: parsed.managedPropertyId,
        cashAccountId: parsed.cashAccountId,
        movementDate: parsed.paidAt ?? new Date().toISOString().slice(0, 10),
        description: `Pago: ${parsed.description}`,
        amount: -parsed.amount,
        externalRef: parsed.documentNumber ?? null,
        movementKind: 'expense_payment',
        expenseId: created.id,
        createdBy: profile.id,
      })
    } catch (payErr) {
      await insertIAdminAuditLogInPostgres({
        administrationId: parsed.administrationId,
        actorProfileId: profile.id,
        entityType: 'iadmin_expenses',
        entityId: created.id,
        action: 'expense.payment_failed',
        metadata: { error: payErr instanceof Error ? payErr.message : String(payErr) },
      })
    }
  }

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
  if (parsed.cashAccountId) {
    revalidatePath(`/iadmin/consorcios/${parsed.managedPropertyId}/cuentas`)
  }
  return { id: created.id, status: initialStatus }
}

const updateExpenseSchema = z.object({
  expenseId: z.string().uuid(),
  description: z.string().trim().min(1).max(240),
  amount: z.number().nonnegative(),
  category: z.string().trim().max(80).nullable().optional(),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expenseKind: z.enum(['ordinaria', 'extraordinaria']),
})

export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>

export type UpdateExpenseResult = { ok: true } | { ok: false; error: string; code?: string }

/**
 * Edita los datos de un gasto ya cargado. Sólo se permite mientras el período
 * siga abierto y NO exista una liquidación emitida/cerrada para ese mes — una
 * vez liquidado, el monto ya impactó en las expensas y editarlo rompería el
 * cálculo. Misma lógica de gate que `createExpense`.
 */
export async function updateExpense(input: UpdateExpenseInput): Promise<UpdateExpenseResult> {
  try {
    await updateExpenseImpl(input)
    return { ok: true }
  } catch (error) {
    if (error instanceof Error) {
      const code = (error as Error & { code?: string }).code
      console.error('[updateExpense] business error:', error.message, code ? `(code=${code})` : '')
      return { ok: false, error: error.message, code }
    }
    console.error('[updateExpense] unknown error:', error)
    return { ok: false, error: 'Error inesperado al editar el gasto' }
  }
}

async function updateExpenseImpl(input: UpdateExpenseInput): Promise<void> {
  const parsed = updateExpenseSchema.parse(input)

  const ctx = await getExpenseEditContextFromPostgres(parsed.expenseId)
  if (!ctx) throw new Error('Gasto no encontrado')

  // Valida que el usuario pertenezca a la administración del gasto (anti-IDOR)
  // y tenga permiso de carga de gastos.
  const { profile } = await requireIAdmin({
    capability: 'expenses.create',
    administrationId: ctx.administration_id,
  })

  const periodLabel =
    ctx.period_year && ctx.period_month
      ? `${String(ctx.period_month).padStart(2, '0')}/${ctx.period_year}`
      : 'el período'

  if (ctx.period_status === 'closed') {
    throw new Error(`El periodo ${periodLabel} esta cerrado y no admite editar gastos.`)
  }
  if (ctx.period_status === 'locked') {
    throw new Error(`El periodo ${periodLabel} esta bloqueado y no admite editar gastos.`)
  }
  if (ctx.blocking_run_status) {
    const error = new Error(
      `Periodo ${periodLabel} ya ${ctx.blocking_run_status === 'issued' ? 'liquidado' : 'cerrado'}. ` +
        `Reabri la liquidacion si necesitas editar este gasto.`,
    )
    ;(error as Error & { code?: string }).code = 'PERIOD_ALREADY_LIQUIDATED'
    throw error
  }

  await updateExpenseInPostgres({
    expenseId: parsed.expenseId,
    description: parsed.description,
    amount: parsed.amount,
    category: parsed.category ?? null,
    issuedAt: parsed.issuedAt ?? null,
    expenseKind: parsed.expenseKind,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: ctx.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_expenses',
    entityId: parsed.expenseId,
    action: 'expense.updated',
    metadata: {
      amount: parsed.amount,
      expense_kind: parsed.expenseKind,
    },
  })

  revalidatePath('/iadmin/gastos')
  revalidatePath(`/iadmin/gastos/${parsed.expenseId}`)
  revalidatePath('/iadmin/cartera')
  revalidatePath(`/iadmin/consorcios/${ctx.managed_property_id}`)
}

const deleteExpenseSchema = z.object({
  expenseId: z.string().uuid(),
})

export type DeleteExpenseInput = z.input<typeof deleteExpenseSchema>

export type DeleteExpenseResult = { ok: true } | { ok: false; error: string; code?: string }

/**
 * Borra un gasto ya cargado. Mismo gate que `updateExpense`: sólo se permite
 * mientras el período siga abierto y NO exista una liquidación emitida/cerrada
 * para ese mes. Una vez liquidado, el monto ya impactó en las expensas y
 * borrarlo rompería el cálculo (hay que reabrir la liquidación primero).
 */
export async function deleteExpense(input: DeleteExpenseInput): Promise<DeleteExpenseResult> {
  try {
    await deleteExpenseImpl(input)
    return { ok: true }
  } catch (error) {
    if (error instanceof Error) {
      const code = (error as Error & { code?: string }).code
      console.error('[deleteExpense] business error:', error.message, code ? `(code=${code})` : '')
      return { ok: false, error: error.message, code }
    }
    console.error('[deleteExpense] unknown error:', error)
    return { ok: false, error: 'Error inesperado al borrar el gasto' }
  }
}

async function deleteExpenseImpl(input: DeleteExpenseInput): Promise<void> {
  const parsed = deleteExpenseSchema.parse(input)

  const ctx = await getExpenseEditContextFromPostgres(parsed.expenseId)
  if (!ctx) throw new Error('Gasto no encontrado')

  // Anti-IDOR + permiso de carga de gastos sobre la administración del gasto.
  const { profile } = await requireIAdmin({
    capability: 'expenses.create',
    administrationId: ctx.administration_id,
  })

  const periodLabel =
    ctx.period_year && ctx.period_month
      ? `${String(ctx.period_month).padStart(2, '0')}/${ctx.period_year}`
      : 'el período'

  if (ctx.period_status === 'closed') {
    throw new Error(`El periodo ${periodLabel} esta cerrado y no admite borrar gastos.`)
  }
  if (ctx.period_status === 'locked') {
    throw new Error(`El periodo ${periodLabel} esta bloqueado y no admite borrar gastos.`)
  }
  if (ctx.blocking_run_status) {
    const error = new Error(
      `Periodo ${periodLabel} ya ${ctx.blocking_run_status === 'issued' ? 'liquidado' : 'cerrado'}. ` +
        `Reabri la liquidacion si necesitas borrar este gasto.`,
    )
    ;(error as Error & { code?: string }).code = 'PERIOD_ALREADY_LIQUIDATED'
    throw error
  }

  await deleteExpenseFromPostgres(parsed.expenseId)

  await insertIAdminAuditLogInPostgres({
    administrationId: ctx.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_expenses',
    entityId: parsed.expenseId,
    action: 'expense.deleted',
    metadata: {
      period_year: ctx.period_year,
      period_month: ctx.period_month,
    },
  })

  revalidatePath('/iadmin/gastos')
  revalidatePath('/iadmin/cartera')
  revalidatePath(`/iadmin/consorcios/${ctx.managed_property_id}`)
}

const repeatExpensesSchema = z.object({
  managedPropertyId: z.string().uuid(),
  targetYear: z.number().int().min(2020).max(2100),
  targetMonth: z.number().int().min(1).max(12),
  // 'add'     → suma los gastos del mes anterior a los que ya haya en el destino.
  // 'replace' → descarta los gastos ya cargados en el destino y sólo deja los copiados.
  mode: z.enum(['add', 'replace']).default('add'),
})

export type RepeatExpensesInput = z.input<typeof repeatExpensesSchema>

export type RepeatExpensesResult =
  | { ok: true; copied: number; replaced: number }
  | { ok: false; error: string; code?: string }

/**
 * Copia los gastos del mes anterior al período destino, dejándolos editables.
 * Permite arrancar un mes nuevo sin tener que recargar todos los rubros a mano.
 * Sólo funciona si el destino no está cerrado/bloqueado ni liquidado.
 */
export async function repeatPreviousMonthExpenses(
  input: RepeatExpensesInput,
): Promise<RepeatExpensesResult> {
  try {
    return await repeatPreviousMonthExpensesImpl(input)
  } catch (error) {
    if (error instanceof Error) {
      const code = (error as Error & { code?: string }).code
      console.error('[repeatPreviousMonthExpenses] business error:', error.message, code ? `(code=${code})` : '')
      return { ok: false, error: error.message, code }
    }
    console.error('[repeatPreviousMonthExpenses] unknown error:', error)
    return { ok: false, error: 'Error inesperado al repetir los gastos' }
  }
}

async function repeatPreviousMonthExpensesImpl(
  input: RepeatExpensesInput,
): Promise<{ ok: true; copied: number; replaced: number }> {
  const parsed = repeatExpensesSchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.managedPropertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile, context } = await requireIAdmin({
    capability: 'expenses.create',
    administrationId: property.administration_id,
  })

  const targetLabel = `${String(parsed.targetMonth).padStart(2, '0')}/${parsed.targetYear}`

  // 1) El período destino no puede estar cerrado/bloqueado ni liquidado.
  const targetPeriod = await getAccountingPeriodIdAndStatusFromPostgres({
    managedPropertyId: parsed.managedPropertyId,
    periodYear: parsed.targetYear,
    periodMonth: parsed.targetMonth,
  })
  if (targetPeriod?.status === 'closed') {
    throw new Error(`El periodo ${targetLabel} esta cerrado y no admite cargar gastos.`)
  }
  if (targetPeriod?.status === 'locked') {
    throw new Error(`El periodo ${targetLabel} esta bloqueado y no admite cargar gastos.`)
  }
  if (targetPeriod) {
    const liqRes = await pgQuery<{ status: string }>(
      `select status::text as status
         from countrify.iadmin_liquidation_runs
        where managed_property_id = $1
          and accounting_period_id = $2
          and status in ('issued', 'closed')
        limit 1`,
      [parsed.managedPropertyId, targetPeriod.id],
    )
    if (liqRes.rows[0]) {
      const error = new Error(
        `Periodo ${targetLabel} ya ${liqRes.rows[0].status === 'issued' ? 'liquidado' : 'cerrado'}. ` +
          `Reabri la liquidacion si necesitas cargar mas gastos en ese mes.`,
      )
      ;(error as Error & { code?: string }).code = 'PERIOD_ALREADY_LIQUIDATED'
      throw error
    }
  }

  // 2) Resolver el mes anterior y traer sus gastos.
  const prevDate = new Date(parsed.targetYear, parsed.targetMonth - 2, 1)
  const prevYear = prevDate.getFullYear()
  const prevMonth = prevDate.getMonth() + 1
  const prevLabel = `${String(prevMonth).padStart(2, '0')}/${prevYear}`

  const prevPeriod = await getAccountingPeriodIdAndStatusFromPostgres({
    managedPropertyId: parsed.managedPropertyId,
    periodYear: prevYear,
    periodMonth: prevMonth,
  })
  if (!prevPeriod) {
    throw new Error(`El mes anterior (${prevLabel}) no tiene gastos para repetir.`)
  }
  const prevExpenses = await listExpensesForPeriodFromPostgres({
    managedPropertyId: parsed.managedPropertyId,
    accountingPeriodId: prevPeriod.id,
  })
  if (prevExpenses.length === 0) {
    throw new Error(`El mes anterior (${prevLabel}) no tiene gastos para repetir.`)
  }

  // 3) Asegurar que exista el período destino.
  let targetPeriodId = targetPeriod?.id ?? null
  if (!targetPeriodId) {
    const created = await ensureAccountingPeriodInPostgres({
      managedPropertyId: parsed.managedPropertyId,
      periodYear: parsed.targetYear,
      periodMonth: parsed.targetMonth,
    })
    targetPeriodId = created.id
  }

  // 4) Modo "reemplazar": borrar lo ya cargado en el destino y copiar todo.
  //    Modo "sumar": conservar lo que el usuario ya cargó a mano y AGREGAR
  //    como gastos nuevos todos los rubros del mes anterior. No deduplicamos
  //    por proveedor: cada gasto es una fila propia (un mismo proveedor puede
  //    tener un gasto ordinario y uno extraordinario en el mismo mes), y así
  //    cada repetición queda registrada de forma trazable en la sección Gastos.
  let replaced = 0
  if (parsed.mode === 'replace') {
    replaced = await deleteExpensesForPeriodFromPostgres({
      managedPropertyId: parsed.managedPropertyId,
      accountingPeriodId: targetPeriodId,
    })
  }

  const canApprove =
    context.isSuperAdmin ||
    (context.memberships
      .find((m) => m.administration.id === property.administration_id)
      ?.capabilities.includes('expenses.approve') ?? false)
  const initialStatus: IAdminExpenseStatus = canApprove ? 'imputed' : 'pending_review'

  // 5) Copiar cada gasto del mes anterior al destino (montos editables después).
  //    Se inserta una fila por gasto, sin deduplicar: lo que el usuario ya
  //    cargó a mano queda intacto y se suman los del mes anterior.
  let copied = 0
  for (const e of prevExpenses) {
    await insertExpenseInPostgres({
      administrationId: property.administration_id,
      managedPropertyId: parsed.managedPropertyId,
      accountingPeriodId: targetPeriodId,
      providerId: e.provider_id,
      category: e.category,
      description: e.description,
      amount: e.amount,
      currency: e.currency,
      issuedAt: null,
      dueAt: null,
      status: initialStatus,
      expenseKind: e.expense_kind,
      createdBy: profile.id,
      approvedBy: initialStatus === 'imputed' ? profile.id : null,
    })
    copied += 1
  }

  await insertIAdminAuditLogInPostgres({
    administrationId: property.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_expenses',
    entityId: targetPeriodId,
    action: 'expense.repeated_from_previous_month',
    metadata: { from: prevLabel, to: targetLabel, mode: parsed.mode, copied, replaced },
  })

  revalidatePath('/iadmin/gastos')
  revalidatePath('/iadmin/cartera')
  revalidatePath(`/iadmin/consorcios/${parsed.managedPropertyId}`)
  return { ok: true, copied, replaced }
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
