'use client'

import { useRouter } from 'next/navigation'
import { BuildingDetail } from '@/components/superadmin/shared'
import type { SuperAdminBuildingDetail } from '@/lib/types'

export function ConsorcioDetailView({
  building,
  metrics,
}: {
  building: SuperAdminBuildingDetail
  metrics: Array<{ label: string; value: number | string }>
}) {
  const router = useRouter()
  return (
    <BuildingDetail building={building} metrics={metrics} onBack={() => router.push('/superadmin/consorcios')} />
  )
}
