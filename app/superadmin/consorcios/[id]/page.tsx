import { notFound } from 'next/navigation'
import { ConsorcioDetailView } from '@/components/superadmin/consorcio-detail-view'
import { getSuperAdminDashboardData } from '@/lib/data'

export default async function ConsorcioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getSuperAdminDashboardData()
  const building = data.buildings.find((b) => b.id === id)
  if (!building) notFound()

  const usersHere = data.users.filter((u) => u.buildingId === id)
  const metrics: Array<{ label: string; value: number | string }> = [
    { label: 'Vecinos', value: usersHere.filter((u) => u.role === 'vecino').length },
    { label: 'Residentes registrados', value: building.registeredNeighbors },
    { label: 'Administradores', value: building.admins.length },
    { label: 'Capacidad', value: building.totalUnits },
    { label: 'Ocupación', value: `${building.occupancyRate}%` },
  ]

  return <ConsorcioDetailView building={building} metrics={metrics} />
}
