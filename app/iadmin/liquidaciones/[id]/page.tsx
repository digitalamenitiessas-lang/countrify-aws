import { notFound, redirect } from 'next/navigation'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminLiquidationRunDetail } from '@/lib/data'

// La vista dedicada de liquidación quedó obsoleta: ahora "ver liquidación"
// abre la mesa de trabajo del mes de ese período (fuente de verdad única).
// Esta página resuelve el run → propiedad + período y redirige a la mesa.
export default async function LiquidacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireIAdmin({ capability: 'liquidations.view' })

  const run = await getIAdminLiquidationRunDetail(id)
  if (!run) {
    notFound()
  }

  const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`
  redirect(`/iadmin/consorcios/${run.managedPropertyId}?period=${period}`)
}
