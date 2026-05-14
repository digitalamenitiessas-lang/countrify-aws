import { notFound } from 'next/navigation'
import { LiquidationDetail } from '@/components/admin-backoffice/liquidaciones/liquidation-detail'
import { findMembership, requireIAdmin } from '@/lib/auth'
import { getIAdminLiquidationRunDetail } from '@/lib/data'
import { IADMIN_CAPABILITIES } from '@/lib/iadmin/capabilities'
import type { IAdminCapability } from '@/lib/types'

export default async function LiquidacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { context } = await requireIAdmin({ capability: 'liquidations.view' })

  const run = await getIAdminLiquidationRunDetail(id)
  if (!run) {
    notFound()
  }

  const capabilities: IAdminCapability[] = context.isSuperAdmin
    ? IADMIN_CAPABILITIES.slice()
    : (findMembership(context, run.administrationId)?.capabilities ?? [])

  return <LiquidationDetail run={run} userCapabilities={capabilities} />
}
