'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { BuildingsList } from '@/components/superadmin/shared'
import type { SuperAdminBuildingDetail } from '@/lib/types'

export function ConsorciosListView({ buildings }: { buildings: SuperAdminBuildingDetail[] }) {
  const router = useRouter()
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-foreground text-lg leading-tight">Consorcios</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Gestioná y revisá la info de cada country adherido.</p>
        </div>
        <Link
          href="/superadmin/consorcios/nuevo"
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium"
        >
          <Plus className="w-4 h-4" />
          Crear consorcio
        </Link>
      </div>
      <BuildingsList buildings={buildings} onSelect={(building) => router.push(`/superadmin/consorcios/${building.id}`)} />
    </div>
  )
}
