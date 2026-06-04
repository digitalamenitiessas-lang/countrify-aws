'use client'

import { Building2, Home, Shield, TrendingUp, Users } from 'lucide-react'
import {
  OccupancyBar,
  PlatformHealthRow,
  StatCard,
  TopBusinessesChart,
  TopBuildingsChart,
  UsersByRoleChart,
  computeDashboardStats,
} from '@/components/superadmin/shared'
import type { SuperAdminDashboardData } from '@/lib/types'

export function InicioView({ data }: { data: SuperAdminDashboardData }) {
  const stats = computeDashboardStats(data)
  const totalUsage = data.promotions.reduce((sum, p) => sum + p.usageCount, 0)

  // Usuarios por country: vecinos + propietarios vinculados a cada building.
  const perCountry = data.buildings
    .map((building) => {
      const usersHere = data.users.filter((u) => u.buildingId === building.id)
      return {
        id: building.id,
        name: building.name,
        vecinos: usersHere.filter((u) => u.role === 'vecino').length,
        propietarios: 0,
        residentes: building.registeredNeighbors,
        admins: building.admins.length,
        occupancyRate: building.occupancyRate,
      }
    })
    .sort((a, b) => b.vecinos + b.propietarios - (a.vecinos + a.propietarios))

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4 text-primary" />
          <p className="text-xs font-medium tracking-wider uppercase text-primary">Panel de super administrador</p>
        </div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Resumen para SuperAdmin</h1>
        <p className="text-sm mt-1 text-muted-foreground">Datos en tiempo real.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Usuarios"
          value={data.users.length}
          sub={`${data.users.filter((u) => u.role === 'vecino').length} residentes`}
          icon={Users}
          tone="navy"
        />
        <StatCard label="Consorcios" value={data.buildings.length} sub="Countries adheridos" icon={Home} tone="accent" />
        <StatCard
          label="Negocios"
          value={data.businesses.length}
          sub={`${data.users.filter((u) => u.role === 'negocio_admin').length} admins`}
          icon={Building2}
          tone="terra"
        />
        <StatCard label="Canjes registrados" value={totalUsage} sub="Desde promotion_redemptions" icon={TrendingUp} tone="green" />
      </div>

      {/* Usuarios por country */}
      <div className="glass-card rounded-xl overflow-hidden mb-8">
        <div className="sa-section-head px-5 py-4 border-b border-border/40 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground">Usuarios por country</h3>
        </div>
        {perCountry.length === 0 ? (
          <div className="px-5 py-8 text-center text-muted-foreground text-sm">No hay consorcios registrados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="sa-thead border-b border-border/50">
                  {['Country', 'Vecinos', 'Propietarios', 'Residentes', 'Admins', 'Ocupación'].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perCountry.map((c) => (
                  <tr key={c.id} className="border-b border-border/30 last:border-0 hover:bg-secondary/30">
                    <td className="px-5 py-3.5 font-medium text-foreground">{c.name}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{c.vecinos}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{c.propietarios}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{c.residentes}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{c.admins}</td>
                    <td className="px-5 py-3.5 w-48">
                      <OccupancyBar rate={c.occupancyRate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Salud de la Plataforma */}
      <div className="mb-8">
        <h3 className="font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Salud de la Plataforma
        </h3>
        <PlatformHealthRow stats={stats} />
      </div>

      {/* Análisis de Plataforma */}
      <div>
        <h3 className="font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Análisis de Plataforma
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <UsersByRoleChart data={stats.usersByRole} />
          <TopBuildingsChart data={stats.top5Buildings} />
          <TopBusinessesChart data={stats.top5Businesses} />
        </div>
      </div>
    </div>
  )
}
