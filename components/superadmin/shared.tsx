'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle,
  ChevronRight,
  Home,
  Mail,
  MapPin,
  Phone,
  Shield,
  Tag,
  TrendingUp,
  Users,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { ROLE_LABELS } from '@/lib/constants'
import { UnitsImportWizard } from '@/components/admin-backoffice/consorcio/units-import-wizard'
import { analyzeConsorcioUnitsColumns, importConsorcioUnits } from '@/app/superadmin/actions'
import type {
  IAdminPropertyKind,
  SuperAdminConsorcioAdminOption,
  SuperAdminBuildingDetail,
  SuperAdminBusinessDetail,
  SuperAdminDashboardData,
  SuperAdminPromotionDetail,
} from '@/lib/types'

export const PROPERTY_KIND_OPTIONS: Array<{ value: IAdminPropertyKind; label: string }> = [
  { value: 'barrio_privado', label: 'Country / Barrio privado' },
  { value: 'consorcio', label: 'Consorcio' },
  { value: 'edificio', label: 'Edificio' },
  { value: 'mixto', label: 'Mixto' },
]

export const PIE_COLORS = ['#112250', '#C4733D', '#666666', '#3b507d'] as const

// ─── Stat Card ───────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: number | string
  sub: string
  icon: typeof Shield
}) {
  return (
    <div className="glass-card rounded-xl p-5">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
        style={{ background: 'rgba(156,156,156,0.15)', border: '1px solid rgba(0,0,0,0.06)' }}
      >
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-sm text-foreground mt-0.5">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({
  children,
  color = 'default',
}: {
  children: React.ReactNode
  color?: 'default' | 'primary' | 'success' | 'warn'
}) {
  const styles: Record<string, string> = {
    default: 'bg-muted text-muted-foreground',
    primary: 'text-white',
    success: 'bg-green-100 text-green-700',
    warn: 'bg-amber-100 text-amber-700',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[color]}`}
      style={color === 'primary' ? { background: 'linear-gradient(135deg, #112250, #0a1838)' } : {}}
    >
      {children}
    </span>
  )
}

// ─── Section Header with optional back ───────────────────────────────────────
export function SectionHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>
      )}
      <div>
        <h2 className="font-bold text-foreground text-lg leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

// ─── Occupancy bar ────────────────────────────────────────────────────────────
export function OccupancyBar({ rate }: { rate: number }) {
  const color = rate >= 80 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(rate, 100)}%`, background: color }} />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-9 text-right">{rate}%</span>
    </div>
  )
}

export function getRoleCreationCopy(role: string) {
  switch (role) {
    case 'consorcio_admin':
      return {
        title: 'Admin consorcio con alcance multi-country',
        body: 'Esta cuenta puede administrar varios consorcios. Crea el usuario primero y asigna sus countries despues desde el wizard de alta de consorcio.',
      }
    case 'negocio_admin':
      return {
        title: 'Admin de negocio',
        body: 'Asocialo a un negocio para dejar lista la operacion comercial desde el panel de negocio.',
      }
    case 'propietario':
      return {
        title: 'Propietario',
        body: 'Puede quedar vinculado a un country para luego asociarlo a su unidad desde IAdmin.',
      }
    case 'vecino':
      return {
        title: 'Vecino',
        body: 'Puede quedar vinculado a un country para completar luego la unidad y el grupo familiar.',
      }
    default:
      return {
        title: 'Usuario de plataforma',
        body: 'Crea la cuenta base y completa luego cualquier relacion operativa especifica.',
      }
  }
}

export function describeAdminAssignment(admin: SuperAdminConsorcioAdminOption | null) {
  if (!admin) {
    return 'Selecciona un admin para ver como quedara la asignacion inicial.'
  }
  if (admin.assignedBuildingsCount === 0) {
    return 'Este sera su primer consorcio. La asignacion quedara como principal y se sincronizara su country base.'
  }
  if (admin.primaryBuildingName) {
    return `Ya administra ${admin.assignedBuildingsCount} consorcio${admin.assignedBuildingsCount === 1 ? '' : 's'}. Este nuevo country quedara como adicional y no reemplazara ${admin.primaryBuildingName} como primario.`
  }
  return `Ya administra ${admin.assignedBuildingsCount} consorcio${admin.assignedBuildingsCount === 1 ? '' : 's'}. Este nuevo country se agregara como adicional.`
}

// ─── CONSORCIOS LIST ──────────────────────────────────────────────────────────
export function BuildingsList({
  buildings,
  onSelect,
}: {
  buildings: SuperAdminBuildingDetail[]
  onSelect: (b: SuperAdminBuildingDetail) => void
}) {
  return (
    <div>
      <SectionHeader
        title="Consorcios"
        subtitle={`${buildings.length} country${buildings.length !== 1 ? 's' : ''} adherido${buildings.length !== 1 ? 's' : ''}`}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {buildings.map((building) => (
          <button
            key={building.id}
            onClick={() => onSelect(building)}
            className="glass-card glass-card-hover rounded-xl p-5 text-left group transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(156,156,156,0.15)', border: '1px solid rgba(0,0,0,0.06)' }}
                >
                  <Home className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                    {building.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {building.address}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-foreground">{building.totalUnits}</div>
                <div className="text-xs text-muted-foreground">Unidades</div>
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{building.registeredNeighbors}</div>
                <div className="text-xs text-muted-foreground">Residentes</div>
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{building.admins.length}</div>
                <div className="text-xs text-muted-foreground">Admin{building.admins.length !== 1 ? 's' : ''}</div>
              </div>
            </div>

            <div className="mt-3">
              <OccupancyBar rate={building.occupancyRate} />
            </div>
          </button>
        ))}

        {buildings.length === 0 && (
          <div className="col-span-2 text-center py-12 text-muted-foreground text-sm">
            No hay consorcios registrados.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CONSORCIO DETAIL ─────────────────────────────────────────────────────────
export function BuildingDetail({
  building,
  metrics,
  onBack,
}: {
  building: SuperAdminBuildingDetail
  metrics?: Array<{ label: string; value: number | string }>
  onBack?: () => void
}) {
  return (
    <div>
      <SectionHeader title={building.name} subtitle={building.address} onBack={onBack} />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Unidades totales', value: building.totalUnits },
          { label: 'Residentes registrados', value: building.registeredNeighbors },
          { label: 'Administradores', value: building.admins.length },
          { label: 'Ocupación', value: `${building.occupancyRate}%` },
        ].map((s) => (
          <div key={s.label} className="glass-card rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Métricas por country (usuarios por rol, etc.) */}
      {metrics && metrics.length > 0 && (
        <div className="glass-card rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-sm text-foreground mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Usuarios y actividad en este country
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-xl border border-border/40 bg-background/60 p-3 text-center">
                <div className="text-lg font-bold text-foreground">{m.value}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Admins */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Usuario Encargado del Consorcio</h3>
          </div>
          {building.admins.length === 0 ? (
            <div className="px-5 py-8 text-center text-muted-foreground text-sm">Sin administrador asignado</div>
          ) : (
            <div className="divide-y divide-border/30">
              {building.admins.map((admin) => (
                <div key={admin.profileId} className="px-5 py-4 flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                    style={{ background: 'linear-gradient(135deg, #112250, #0a1838)' }}
                  >
                    {admin.fullName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">{admin.fullName}</span>
                      {admin.isPrimary && <Badge color="primary">Principal</Badge>}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Mail className="w-3 h-3" />
                      {admin.email}
                    </div>
                    {admin.phone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Phone className="w-3 h-3" />
                        {admin.phone}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Occupancy */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Nivel de Ocupación</h3>
          </div>
          <div className="px-5 py-6 flex flex-col items-center justify-center gap-4">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/30" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke="#112250" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${Math.min(building.occupancyRate, 100) * 2.51} 251`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">{building.occupancyRate}%</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm text-foreground font-medium">
                {building.registeredNeighbors} de {building.totalUnits} unidades ocupadas
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">según residentes registrados</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Configuración del consorcio</h3>
          </div>
          {!building.managedProperty ? (
            <div className="px-5 py-8 text-center text-muted-foreground text-sm">
              Este country todavía no tiene una capa IAdmin configurada.
            </div>
          ) : (
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Nombre a mostrar</p>
                <p className="mt-1 font-medium text-foreground">{building.managedProperty.displayName ?? building.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Tipo</p>
                <p className="mt-1 font-medium capitalize text-foreground">{building.managedProperty.propertyKind.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">CUIT</p>
                <p className="mt-1 text-foreground">{building.managedProperty.taxId ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Inicio de gestión</p>
                <p className="mt-1 text-foreground">{building.managedProperty.managedSince ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Fee administración</p>
                <p className="mt-1 text-foreground">
                  {building.managedProperty.managementFeePct !== null ? `${building.managedProperty.managementFeePct}%` : '—'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Notas</p>
                <p className="mt-1 text-foreground">{building.managedProperty.notes ?? 'Sin notas cargadas.'}</p>
              </div>
            </div>
          )}
        </div>

        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <Home className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Administración asociada</h3>
          </div>
          {!building.administration ? (
            <div className="px-5 py-8 text-center text-muted-foreground text-sm">Sin administración asociada todavía.</div>
          ) : (
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Nombre</p>
                <p className="mt-1 font-medium text-foreground">{building.administration.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Razón social</p>
                <p className="mt-1 text-foreground">{building.administration.legalName ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">CUIT</p>
                <p className="mt-1 text-foreground">{building.administration.taxId ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Email</p>
                <p className="mt-1 text-foreground">{building.administration.contactEmail ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Teléfono</p>
                <p className="mt-1 text-foreground">{building.administration.contactPhone ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Estado</p>
                <p className="mt-1 text-foreground">{building.administration.isActive ? 'Activa' : 'Inactiva'}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Residents table */}
      <div className="glass-card rounded-xl overflow-hidden mt-6">
        <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground">Residentes Registrados ({building.registeredNeighbors})</h3>
        </div>
        {building.neighbors.length === 0 ? (
          <div className="px-5 py-8 text-center text-muted-foreground text-sm">
            No hay residentes registrados en este country.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50" style={{ background: 'rgba(0,0,0,0.03)' }}>
                  {['Nombre', 'Email', 'Piso', 'Unidad', 'Teléfono'].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {building.neighbors.map((neighbor) => (
                  <tr key={neighbor.id} className="border-b border-border/30 last:border-0 hover:bg-secondary/30">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #112250, #0a1838)' }}
                        >
                          {neighbor.avatarText}
                        </div>
                        <span className="font-medium text-foreground">{neighbor.fullName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{neighbor.email}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{neighbor.floor ?? '—'}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{neighbor.unit ?? '—'}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{neighbor.phone ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── NEGOCIOS LIST ────────────────────────────────────────────────────────────
export function BusinessesList({
  businesses,
  onSelect,
}: {
  businesses: SuperAdminBusinessDetail[]
  onSelect: (b: SuperAdminBusinessDetail) => void
}) {
  return (
    <div>
      <SectionHeader
        title="Negocios"
        subtitle={`${businesses.length} negocio${businesses.length !== 1 ? 's' : ''} afiliado${businesses.length !== 1 ? 's' : ''}`}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {businesses.map((business) => (
          <button
            key={business.id}
            onClick={() => onSelect(business)}
            className="glass-card glass-card-hover rounded-xl p-5 text-left group transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden border border-border/60 bg-background flex items-center justify-center flex-shrink-0">
                  {business.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={business.logoUrl} alt={business.name} className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                    {business.name}
                  </h3>
                  <Badge>{business.category}</Badge>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
            </div>

            <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{business.description}</p>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-foreground">{business.promotions.length}</div>
                <div className="text-xs text-muted-foreground">Cupones</div>
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{business.totalRedemptions}</div>
                <div className="text-xs text-muted-foreground">Canjes</div>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-foreground truncate">{business.topBuilding ?? '—'}</div>
                <div className="text-xs text-muted-foreground">Top country</div>
              </div>
            </div>

            <div className="mt-3">
              <Badge color={business.monthlyStatus?.isCompliant ? 'success' : 'warn'}>
                {business.monthlyStatus?.isCompliant ? 'Al dia este mes' : 'Pendiente este mes'}
              </Badge>
            </div>
          </button>
        ))}

        {businesses.length === 0 && (
          <div className="col-span-2 text-center py-12 text-muted-foreground text-sm">No hay negocios registrados.</div>
        )}
      </div>
    </div>
  )
}

// ─── NEGOCIO DETAIL ───────────────────────────────────────────────────────────
export function BusinessDetail({ business, onBack }: { business: SuperAdminBusinessDetail; onBack?: () => void }) {
  return (
    <div>
      <SectionHeader title={business.name} subtitle={business.category} onBack={onBack} />

      <div className="glass-card rounded-xl p-5 mb-6 flex items-start gap-5">
        <div className="w-16 h-16 rounded-xl overflow-hidden border border-border/60 bg-background flex items-center justify-center flex-shrink-0">
          {business.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logoUrl} alt={business.name} className="w-full h-full object-cover" />
          ) : (
            <Building2 className="w-7 h-7 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-foreground text-lg">{business.name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{business.description}</p>
          {business.ownerEmail ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Mail asociado: <span className="font-medium text-foreground">{business.ownerEmail}</span>
            </p>
          ) : null}
          <div className="flex items-center gap-3 mt-3">
            <Badge>{business.category}</Badge>
            <Badge color={business.monthlyStatus?.isCompliant ? 'success' : 'warn'}>
              {business.monthlyStatus?.isCompliant ? 'Promocion mensual cumplida' : 'Promocion mensual pendiente'}
            </Badge>
            {business.topBuilding && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Más activo en: <strong className="text-foreground ml-1">{business.topBuilding}</strong>
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center flex-shrink-0">
          <div className="glass-card rounded-lg px-4 py-3">
            <div className="text-xl font-bold text-foreground">{business.promotions.length}</div>
            <div className="text-xs text-muted-foreground">Cupones</div>
          </div>
          <div className="glass-card rounded-lg px-4 py-3">
            <div className="text-xl font-bold text-foreground">{business.totalRedemptions}</div>
            <div className="text-xs text-muted-foreground">Canjes</div>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground">Cupones y Promociones ({business.promotions.length})</h3>
        </div>
        {business.promotions.length === 0 ? (
          <div className="px-5 py-8 text-center text-muted-foreground text-sm">
            Este negocio no tiene promociones cargadas.
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {business.promotions.map((promotion) => (
              <PromotionRow key={promotion.id} promotion={promotion} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── PROMOTION ROW (expandable) ───────────────────────────────────────────────
export function PromotionRow({ promotion }: { promotion: SuperAdminPromotionDetail }) {
  const [expanded, setExpanded] = useState(false)
  const isExpired = promotion.expirationDate < new Date().toISOString().slice(0, 10)

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-5 py-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg overflow-hidden border border-border/60 bg-background flex items-center justify-center flex-shrink-0">
            {promotion.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={promotion.imageUrl} alt={promotion.title} className="w-full h-full object-cover" />
            ) : (
              <Tag className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-foreground text-sm">{promotion.title}</p>
                <p className="text-xs text-primary font-medium mt-0.5">{promotion.discount}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isExpired ? <Badge color="warn">Vencido</Badge> : <Badge color="success">Activo</Badge>}
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-xs text-muted-foreground">
                {promotion.usageCount} canje{promotion.usageCount !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-muted-foreground">Vence: {promotion.expirationDate}</span>
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 pt-0">
          <div className="rounded-lg p-4" style={{ background: 'rgba(0,0,0,0.03)' }}>
            {promotion.redemptionsByBuilding.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center">Sin canjes registrados todavía.</p>
            ) : (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Uso por country</p>
                <div className="space-y-2">
                  {promotion.redemptionsByBuilding.map((item) => {
                    const maxCount = promotion.redemptionsByBuilding[0].count
                    const pct = Math.round((item.count / maxCount) * 100)
                    return (
                      <div key={item.buildingId} className="flex items-center gap-3">
                        <div className="w-32 text-xs text-foreground font-medium truncate">{item.buildingName}</div>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #112250, #D4784E)' }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground w-14 text-right">
                          {item.count} canje{item.count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export interface DashboardStats {
  usersByRole: { role: string; label: string; count: number }[]
  avgOccupancy: number
  activePromotions: number
  expiredPromotions: number
  totalRedemptions: number
  buildingsWithoutAdmin: number
  top5Buildings: { name: string; occupancyRate: number }[]
  top5Businesses: { name: string; totalRedemptions: number }[]
}

export function computeDashboardStats(data: SuperAdminDashboardData): DashboardStats {
  const roleCounts = data.users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1
    return acc
  }, {})

  const usersByRole = (['vecino', 'propietario', 'consorcio_admin', 'negocio_admin'] as const).map((role) => ({
    role,
    label: ROLE_LABELS[role],
    count: roleCounts[role] ?? 0,
  }))

  const avgOccupancy =
    data.buildings.length === 0
      ? 0
      : Math.round(data.buildings.reduce((sum, b) => sum + b.occupancyRate, 0) / data.buildings.length)

  const today = new Date().toISOString().slice(0, 10)
  const activePromotions = data.promotions.filter((p) => p.expirationDate >= today).length
  const expiredPromotions = data.promotions.length - activePromotions

  const totalRedemptions = data.promotions.reduce((sum, p) => sum + p.usageCount, 0)

  const buildingsWithoutAdmin = data.buildings.filter((b) => b.admins.length === 0).length

  const top5Buildings = [...data.buildings]
    .sort((a, b) => b.occupancyRate - a.occupancyRate)
    .slice(0, 5)
    .map((b) => ({ name: b.name, occupancyRate: b.occupancyRate }))

  const top5Businesses = [...data.businesses]
    .sort((a, b) => b.totalRedemptions - a.totalRedemptions)
    .slice(0, 5)
    .map((b) => ({ name: b.name, totalRedemptions: b.totalRedemptions }))

  return { usersByRole, avgOccupancy, activePromotions, expiredPromotions, totalRedemptions, buildingsWithoutAdmin, top5Buildings, top5Businesses }
}

export function PlatformHealthRow({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Ocupación promedio" value={stats.avgOccupancy} sub="% promedio plataforma" icon={TrendingUp} />
      <StatCard label="Promociones activas" value={stats.activePromotions} sub={`${stats.expiredPromotions} vencidas`} icon={Tag} />
      <StatCard label="Canjes totales" value={stats.totalRedemptions} sub="registros acumulados" icon={CheckCircle} />
      <StatCard label="Sin administrador" value={stats.buildingsWithoutAdmin} sub="consorcios sin encargado" icon={AlertTriangle} />
    </div>
  )
}

export function UsersByRoleChart({ data }: { data: DashboardStats['usersByRole'] }) {
  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="font-semibold text-foreground text-sm mb-4">Usuarios por Rol</h3>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
              {data.map((entry, index) => (
                <Cell key={entry.role} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [value, name]}
              contentStyle={{ background: '#FFFFFF', border: '1px solid rgba(17, 34, 80,0.14)', borderRadius: 8, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((entry, index) => (
          <div key={entry.role} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
            <span className="text-xs text-muted-foreground">
              {entry.label} <span className="font-medium text-foreground">{entry.count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TopBuildingsChart({ data }: { data: DashboardStats['top5Buildings'] }) {
  const fmt = (v: string) => (v.length > 14 ? v.slice(0, 13) + '…' : v)
  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="font-semibold text-foreground text-sm mb-4">Top Consorcios por Ocupación</h3>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#666666' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={110} tickFormatter={fmt} tick={{ fontSize: 11, fill: '#1A1A1A' }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value: number) => [`${value}%`, 'Ocupación']}
              contentStyle={{ background: '#FFFFFF', border: '1px solid rgba(17, 34, 80,0.14)', borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="occupancyRate" fill="#112250" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function TopBusinessesChart({ data }: { data: DashboardStats['top5Businesses'] }) {
  const fmt = (v: string) => (v.length > 14 ? v.slice(0, 13) + '…' : v)
  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="font-semibold text-foreground text-sm mb-4">Top Negocios por Canjes</h3>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 11, fill: '#666666' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={110} tickFormatter={fmt} tick={{ fontSize: 11, fill: '#1A1A1A' }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value: number) => [value, 'Canjes']}
              contentStyle={{ background: '#FFFFFF', border: '1px solid rgba(17, 34, 80,0.14)', borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="totalRedemptions" fill="#C4733D" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── CONSORCIO RECIÉN CREADO → CARGA DE PADRÓN ──────────────────────────────────
export type CreatedConsorcio = {
  buildingId: string
  administrationId: string
  managedPropertyId: string
  name: string
  admin: { fullName: string; email: string; password: string | null; isNew: boolean }
}

export function ConsorcioCreatedScreen({
  created,
  onGoToBuilding,
  onCreateAnother,
}: {
  created: CreatedConsorcio
  onGoToBuilding: () => void
  onCreateAnother: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-base">Consorcio creado: {created.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ya quedó con administración, configuración IAdmin y admin asignado. Solo falta cargar las unidades con sus alícuotas.
            </p>

            <div className="mt-4 rounded-xl border border-border/40 bg-background/60 p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-primary">
                Credenciales para entregar al administrador
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Nombre</p>
                  <p className="mt-0.5 font-medium text-foreground">{created.admin.fullName || '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Email de acceso</p>
                  <p className="mt-0.5 font-medium text-foreground">{created.admin.email || '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Contraseña inicial</p>
                  {created.admin.isNew && created.admin.password ? (
                    <p className="mt-0.5 font-mono font-medium text-foreground">{created.admin.password}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Se usó una cuenta existente — conserva su contraseña actual.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border/40 pt-4">
          <button
            type="button"
            onClick={onCreateAnother}
            className="rounded-lg border border-border/50 px-4 py-2 text-sm font-semibold text-foreground"
          >
            Crear otro consorcio
          </button>
          <button
            type="button"
            onClick={onGoToBuilding}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium"
          >
            Ir al consorcio
          </button>
        </div>
      </div>

      <div className="glass-card rounded-xl p-5">
        <div className="mb-4">
          <h3 className="font-semibold text-foreground text-sm">Cargar padrón de unidades (opcional)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Subí el Excel que te pasó el administrador con las unidades y sus alícuotas. La IA mapea las columnas
            automáticamente (unidad, tipo, piso, superficie, alícuota, titular, CUIT, email, teléfono) y vos revisás
            antes de confirmar. Si todavía no lo tenés, podés saltearlo y cargarlo después.
          </p>
        </div>
        <UnitsImportWizard
          administrationId={created.administrationId}
          propertyId={created.managedPropertyId}
          propertyName={created.name}
          analyzeAction={analyzeConsorcioUnitsColumns}
          importAction={importConsorcioUnits}
        />
      </div>
    </div>
  )
}
