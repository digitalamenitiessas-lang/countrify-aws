import { notFound } from 'next/navigation'
import { ExpenseDetail } from '@/components/admin-backoffice/gastos/expense-detail'
import { findMembership, requireIAdmin } from '@/lib/auth'
import { getIAdminExpenseDetail } from '@/lib/data'
import { IADMIN_CAPABILITIES } from '@/lib/iadmin/capabilities'
import type { IAdminCapability } from '@/lib/types'

export default async function GastoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { context } = await requireIAdmin({ capability: 'expenses.view' })

  const data = await getIAdminExpenseDetail(id)
  if (!data) {
    notFound()
  }

  const capabilities: IAdminCapability[] = context.isSuperAdmin
    ? IADMIN_CAPABILITIES.slice()
    : (findMembership(context, data.expense.administrationId)?.capabilities ?? [])

  return (
    <ExpenseDetail
      expense={data.expense}
      documents={data.documents}
      payment={data.payment}
      cashAccounts={data.cashAccounts}
      userCapabilities={capabilities}
    />
  )
}
