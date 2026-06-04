'use client'

import { Building2, Home, Mail, Phone, Users } from 'lucide-react'
import { ConsorcioCasesPanel } from '@/components/complaints/consorcio-cases-panel'
import type { ConsorcioDashboardData } from '@/lib/types'

export function ConsorcioDashboard({ data }: { data: ConsorcioDashboardData }) {
  if (data.managedBuildings.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="glass-card rounded-2xl p-8">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-5 h-5 text-primary" />
            <h1 className="font-serif text-2xl font-bold text-foreground">Sin edificios asignados</h1>
          </div>
          <p className="text-muted-foreground">
            Tu cuenta tiene rol de consorcio, pero todavia no tiene edificios vinculados en `building_admin_assignments`.
          </p>
        </div>
      </div>
    )
  }

  const neighborRows = data.managedBuildings.flatMap((managedBuilding) =>
    managedBuilding.neighbors.map((neighbor) => ({
      ...neighbor,
      buildingName: managedBuilding.building.name,
    })),
  )

  return (
    <>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <div className="glass-card rounded-3xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-4 h-4 text-primary" />
          <p className="text-xs text-primary font-medium tracking-wider uppercase">Panel del consorcio</p>
        </div>
        <h1 className="font-serif text-3xl font-bold text-foreground">Mesa de entradas multi-edificio</h1>
        <p className="text-muted-foreground text-sm mt-2">
          Seguimiento centralizado de expedientes, vecinos registrados y actividad por edificio.
        </p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Edificios asignados', value: data.totalBuildings, icon: Building2 },
          { label: 'Unidades totales', value: data.totalUnits, icon: Home },
          { label: 'Vecinos registrados', value: data.totalNeighbors, icon: Users },
          { label: 'Expedientes totales', value: data.totalComplaintCases, icon: Building2 },
        ].map((stat) => (
          <div key={stat.label} className="glass-card rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(156,156,156,0.15)', border: '1px solid rgba(0,0,0,0.06)' }}>
              <stat.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <ConsorcioCasesPanel data={data} />

      <div className="glass-card rounded-3xl overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary" />
            <p className="text-xs text-primary font-medium tracking-wider uppercase">Vecinos registrados</p>
          </div>
          <h2 className="font-serif text-2xl font-bold text-foreground">Padron consolidado</h2>
          <p className="text-sm text-muted-foreground mt-1">Vista unica de vecinos para todos los edificios asignados.</p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50" style={{ background: 'rgba(0,0,0,0.03)' }}>
              <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">Vecino</th>
              <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">Edificio</th>
              <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">Unidad</th>
              <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">Contacto</th>
              <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">Alta</th>
            </tr>
          </thead>
          <tbody>
            {neighborRows.length > 0 ? (
              neighborRows.map((neighbor, index) => (
                <tr key={neighbor.id} className={`border-b border-border/30 transition-colors hover:bg-secondary/30 ${index === neighborRows.length - 1 ? 'border-0' : ''}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white" style={{ background: 'linear-gradient(135deg, #F04E23, #C73E15)' }}>
                        {neighbor.avatarText}
                      </div>
                      <span className="font-medium text-foreground">{neighbor.fullName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{neighbor.buildingName}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">Piso {neighbor.floor ?? '-'} · Depto {neighbor.unit ?? '-'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col gap-1 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="text-xs">{neighbor.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" />
                        <span className="text-xs">{neighbor.phone ?? 'No registrado'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">{new Date(neighbor.createdAt).toLocaleDateString('es-AR')}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-5 py-16 text-center text-muted-foreground">
                  Todavia no hay vecinos registrados en tus edificios asignados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

    </>
  )
}
