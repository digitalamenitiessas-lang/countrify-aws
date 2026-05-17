'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  ensureAccountingPeriodInPostgres,
  getManagedPropertyAdminIdFromPostgres,
  insertRecurringExpenseInPostgres,
  listExpenseProviderIdsForPeriodInPostgres,
  listRecentProviderExpensesInPostgres,
  listRecurringProvidersFromPostgres,
} from '@/lib/db/iadmin-writes'
import type { IAdminExpenseStatus } from '@/lib/types'

const schema = z.object({
  propertyId: z.string().uuid(),
  periodYear: z.number().int().optional(),
  periodMonth: z.number().int().min(1).max(12).optional(),
})

export type CloneRecurringResult = {
  created: number
  skipped: Array<{ providerName: string; reason: string }>
  totalAmount: number
  expenseIds: string[]
}

export async function cloneRecurringExpenses(
  input: z.input<typeof schema>,
): Promise<CloneRecurringResult> {
  const parsed = schema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile, context } = await requireIAdmin({
    capability: 'expenses.recurring.manage',
    administrationId: property.administration_id,
  })

  const now = new Date()
  const year = parsed.periodYear ?? now.getFullYear()
  const month = parsed.periodMonth ?? now.getMonth() + 1

  const period = await ensureAccountingPeriodInPostgres({
    managedPropertyId: parsed.propertyId,
    periodYear: year,
    periodMonth: month,
  })

  const providers = await listRecurringProvidersFromPostgres(property.administration_id)
  if (providers.length === 0) {
    return { created: 0, skipped: [], totalAmount: 0, expenseIds: [] }
  }

  const providerIds = providers.map((p) => p.id)
  const existingProviderIds = new Set(
    await listExpenseProviderIdsForPeriodInPostgres({
      managedPropertyId: parsed.propertyId,
      periodId: period.id,
      providerIds,
    }),
  )

  const fromDate = new Date(year, month - 3 - 1, 1).toISOString().slice(0, 10)
  const historyRows = await listRecentProviderExpensesInPostgres({
    managedPropertyId: parsed.propertyId,
    providerIds,
    fromDate,
  })

  const lastAmountByProvider = new Map<string, number>()
  for (const r of historyRows) {
    if (!r.provider_id) continue
    if (lastAmountByProvider.has(r.provider_id)) continue
    lastAmountByProvider.set(r.provider_id, Number(r.amount))
  }

  const canApprove =
    context.isSuperAdmin ||
    (context.memberships
      .find((m) => m.administration.id === property.administration_id)
      ?.capabilities.includes('expenses.approve') ?? false)
  const initialStatus: IAdminExpenseStatus = canApprove ? 'imputed' : 'pending_review'

  const today = new Date(year, month - 1, 5)
  const issuedAt = today.toISOString().slice(0, 10)

  const result: CloneRecurringResult = { created: 0, skipped: [], totalAmount: 0, expenseIds: [] }

  for (const p of providers) {
    if (existingProviderIds.has(p.id)) {
      result.skipped.push({ providerName: p.name, reason: 'ya hay un gasto de este proveedor este mes' })
      continue
    }
    const lastAmount = lastAmountByProvider.get(p.id)
    const amount =
      lastAmount ??
      (p.recurring_amount !== null && p.recurring_amount !== undefined ? Number(p.recurring_amount) : null)
    if (amount === null) {
      result.skipped.push({ providerName: p.name, reason: 'sin monto historico ni recurring_amount' })
      continue
    }

    const description = `${p.name} - ${String(month).padStart(2, '0')}/${year}`

    try {
      const created = await insertRecurringExpenseInPostgres({
        administrationId: property.administration_id,
        managedPropertyId: parsed.propertyId,
        accountingPeriodId: period.id,
        providerId: p.id,
        category: p.default_category ?? null,
        description,
        amount,
        issuedAt,
        status: initialStatus,
        expenseKind: p.recurring_kind ?? 'ordinaria',
        createdBy: profile.id,
        approvedBy: initialStatus === 'imputed' ? profile.id : null,
      })
      result.created += 1
      result.totalAmount += amount
      result.expenseIds.push(created.id)
    } catch (error) {
      result.skipped.push({
        providerName: p.name,
        reason: error instanceof Error ? error.message : 'insert fail',
      })
    }
  }

  if (result.created > 0) {
    await insertIAdminAuditLogInPostgres({
      administrationId: property.administration_id,
      actorProfileId: profile.id,
      entityType: 'iadmin_managed_properties',
      entityId: parsed.propertyId,
      action: 'expenses.recurring_cloned',
      metadata: {
        period: `${year}-${String(month).padStart(2, '0')}`,
        created: result.created,
        skipped: result.skipped.length,
        total: Math.round(result.totalAmount * 100) / 100,
      },
    })
  }

  revalidatePath('/iadmin/gastos')
  revalidatePath('/iadmin/cartera')
  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)

  result.totalAmount = Math.round(result.totalAmount * 100) / 100
  return result
}
