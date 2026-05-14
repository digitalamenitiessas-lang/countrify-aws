import { notFound } from 'next/navigation'
import { ConsorcioSubNav } from '@/components/admin-backoffice/consorcio/consorcio-subnav'
import { findMembership, requireIAdmin } from '@/lib/auth'
import { getIAdminConsorcioDetail } from '@/lib/data'
import { IADMIN_CAPABILITIES } from '@/lib/iadmin/capabilities'
import type { IAdminCapability } from '@/lib/types'

export default async function ConsorcioLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { context } = await requireIAdmin({ capability: 'consorcio.view' })

  const detail = await getIAdminConsorcioDetail(id)
  if (!detail) {
    notFound()
  }

  const capabilities: IAdminCapability[] = context.isSuperAdmin
    ? IADMIN_CAPABILITIES.slice()
    : (findMembership(context, detail.property.administrationId)?.capabilities ?? [])

  return (
    <div className="space-y-6">
      <ConsorcioSubNav
        propertyId={id}
        propertyName={detail.property.displayName ?? detail.property.buildingName}
        propertyAddress={detail.property.buildingAddress}
        allowedCapabilities={capabilities}
      />
      {children}
    </div>
  )
}
