import { notFound } from 'next/navigation'
import { ConsorcioDetail } from '@/components/admin-backoffice/consorcio/consorcio-detail'
import { findMembership, requireIAdmin } from '@/lib/auth'
import { getIAdminConsorcioDetail, getIAdminUnitsWithHolders } from '@/lib/data'
import { IADMIN_CAPABILITIES } from '@/lib/iadmin/capabilities'
import type { IAdminCapability } from '@/lib/types'

export default async function ConsorcioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { context } = await requireIAdmin({ capability: 'consorcio.view' })

  const [detail, unitsWithHolders] = await Promise.all([
    getIAdminConsorcioDetail(id),
    getIAdminUnitsWithHolders(id),
  ])

  if (!detail) {
    notFound()
  }

  const capabilities: IAdminCapability[] = context.isSuperAdmin
    ? IADMIN_CAPABILITIES.slice()
    : (findMembership(context, detail.property.administrationId)?.capabilities ?? [])

  return (
    <ConsorcioDetail
      property={detail.property}
      units={unitsWithHolders}
      recentExpenses={detail.recentExpenses}
      currentPeriod={detail.currentPeriod}
      buildingInformation={detail.buildingInformation}
      totals={detail.totals}
      userCapabilities={capabilities}
    />
  )
}
