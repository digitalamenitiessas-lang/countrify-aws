import { notFound } from 'next/navigation'
import { CashAccountsManager } from '@/components/admin-backoffice/consorcio/cash-accounts-manager'
import { can, requireIAdmin } from '@/lib/auth'
import { getIAdminCashAccounts, getIAdminCashMovements, getIAdminConsorcioDetail } from '@/lib/data'

export default async function ConsorcioCuentasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { context } = await requireIAdmin({ capability: 'cash_accounts.view' })

  const detail = await getIAdminConsorcioDetail(id)
  if (!detail) {
    notFound()
  }

  const [accounts, movements] = await Promise.all([
    getIAdminCashAccounts(id),
    getIAdminCashMovements(id, { limit: 100 }),
  ])

  const canManage = can(context, 'cash_accounts.manage', {
    administrationId: detail.property.administrationId,
  })

  return (
    <CashAccountsManager
      propertyId={id}
      accounts={accounts}
      movements={movements}
      canManage={canManage}
    />
  )
}
