import { notFound } from 'next/navigation'
import { NegocioDetailView } from '@/components/superadmin/negocio-detail-view'
import { getSuperAdminDashboardData } from '@/lib/data'

export default async function NegocioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getSuperAdminDashboardData()
  const business = data.businesses.find((b) => b.id === id)
  if (!business) notFound()

  return <NegocioDetailView business={business} />
}
