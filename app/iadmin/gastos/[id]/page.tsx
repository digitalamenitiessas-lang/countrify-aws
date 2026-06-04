import { notFound } from 'next/navigation'
import { ExpenseDetail } from '@/components/admin-backoffice/gastos/expense-detail'
import { findMembership, requireIAdmin } from '@/lib/auth'
import { getIAdminExpenseDetail } from '@/lib/data'
import { getExpenseEditContextFromPostgres } from '@/lib/db/iadmin-writes'
import { IADMIN_CAPABILITIES } from '@/lib/iadmin/capabilities'
import type { IAdminCapability } from '@/lib/types'

export default async function GastoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { context } = await requireIAdmin({ capability: 'expenses.view' })

  const [data, editCtx] = await Promise.all([
    getIAdminExpenseDetail(id),
    getExpenseEditContextFromPostgres(id),
  ])
  if (!data) {
    notFound()
  }

  const capabilities: IAdminCapability[] = context.isSuperAdmin
    ? IADMIN_CAPABILITIES.slice()
    : (findMembership(context, data.expense.administrationId)?.capabilities ?? [])

  // El gasto se puede editar mientras el período esté abierto y no exista una
  // liquidación emitida/cerrada que lo congele. Mismo criterio que la action.
  const periodLabel =
    editCtx?.period_year && editCtx?.period_month
      ? `${String(editCtx.period_month).padStart(2, '0')}/${editCtx.period_year}`
      : 'el período'
  let editBlockedReason: string | null = null
  if (editCtx?.period_status === 'closed') {
    editBlockedReason = `El período ${periodLabel} está cerrado.`
  } else if (editCtx?.period_status === 'locked') {
    editBlockedReason = `El período ${periodLabel} está bloqueado.`
  } else if (editCtx?.blocking_run_status) {
    editBlockedReason = `La liquidación de ${periodLabel} ya está ${
      editCtx.blocking_run_status === 'issued' ? 'emitida' : 'cerrada'
    }.`
  }
  const canEdit = editBlockedReason === null

  return (
    <ExpenseDetail
      expense={data.expense}
      documents={data.documents}
      payment={data.payment}
      cashAccounts={data.cashAccounts}
      userCapabilities={capabilities}
      canEdit={canEdit}
      editBlockedReason={editBlockedReason}
    />
  )
}
