import { notFound } from 'next/navigation'
import { PrintableLiquidation } from '@/components/admin-backoffice/liquidaciones/printable-liquidation'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminLiquidationRunDetail } from '@/lib/data'

export default async function ImprimirLiquidacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireIAdmin({ capability: 'liquidations.view' })
  const run = await getIAdminLiquidationRunDetail(id)
  if (!run) notFound()
  return <PrintableLiquidation run={run} />
}
