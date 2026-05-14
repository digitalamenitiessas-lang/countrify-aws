'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { toast } from 'sonner'
import { ROLE_LABELS } from '@/lib/constants'
import { ChatWidget } from '@/components/ai/chat-widget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import DynamicMap from '@/components/map/map-view-dynamic'
import {
  analyzeInitialOccupancyFile,
  confirmInitialOccupancyImport,
  createBusinessWithAdmin,
  createManagedProperty,
  createPlatformUser,
} from '@/app/superadmin/actions'
import type {
  IAdminPropertyKind,
  InitialOccupancyImportPreview,
  InitialOccupancyImportRowDraft,
  InitialOccupancyImportRowStatus,
  InitialOccupancyUnitDecision,
  UnitProfileRelationship,
  SuperAdminConsorcioAdminOption,
  SuperAdminBuildingDetail,
  SuperAdminBusinessDetail,
  SuperAdminDashboardData,
  SuperAdminPromotionDetail,
  UserRole,
} from '@/lib/types'

type TabType = 'overview' | 'buildings' | 'users' | 'businesses' | 'promotions'

const PROPERTY_KIND_OPTIONS: Array<{ value: IAdminPropertyKind; label: string }> = [
  { value: 'consorcio', label: 'Consorcio' },
  { value: 'barrio_privado', label: 'Barrio privado' },
  { value: 'country', label: 'Country' },
  { value: 'mixto', label: 'Mixto' },
]

type ConsorcioWizardStepId = 'building' | 'administration' | 'property' | 'admin' | 'summary'

const CONSORCIO_WIZARD_STEPS: Array<{
  id: ConsorcioWizardStepId
  label: string
  description: string
  optional?: boolean
}> = [
  { id: 'building', label: 'Country', description: 'Datos base del country o consorcio.' },
  {
    id: 'administration',
    label: 'Quién administra',
    description: 'Datos de la administración del consorcio. Puedes dejarlo para después.',
    optional: true,
  },
  { id: 'property', label: 'Datos en Countrify', description: 'Como queda configurado el consorcio dentro del sistema.' },
  { id: 'admin', label: 'Administrador inicial', description: 'Cuenta que operara este consorcio.' },
  { id: 'summary', label: 'Resumen', description: 'Verificacion final antes de crear.' },
]
const PIE_COLORS = ['#112250', '#C4733D', '#666666', '#3b507d'] as const

type ImportWizardStep = 'building' | 'upload' | 'review' | 'confirm'

const IMPORT_STEP_LABELS: Array<{ id: ImportWizardStep; label: string }> = [
  { id: 'building', label: 'Seleccionar country' },
  { id: 'upload', label: 'Subir archivo' },
  { id: 'review', label: 'Revisar propuesta IA' },
  { id: 'confirm', label: 'Confirmar importación' },
]

const IMPORT_RELATIONSHIP_OPTIONS: Array<{ value: UnitProfileRelationship; label: string }> = [
  { value: 'propietario', label: 'Propietario' },
  { value: 'vecino_principal', label: 'Vecino principal' },
  { value: 'vecino_adicional', label: 'Vecino adicional' },
]

function normalizeImportText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function recomputeImportPreview(preview: InitialOccupancyImportPreview): InitialOccupancyImportPreview {
  const groupedByUnit = new Map<string, InitialOccupancyImportRowDraft[]>()

  for (const row of preview.rows) {
    const key = normalizeImportText(row.unitCode)
    if (!key) continue
    const group = groupedByUnit.get(key) ?? []
    group.push(row)
    groupedByUnit.set(key, group)
  }

  const rows = preview.rows.map((row) => {
    const reasons: string[] = []
    const unitKey = normalizeImportText(row.unitCode)
    const unitRows = unitKey ? groupedByUnit.get(unitKey) ?? [] : []
    const principalCount = unitRows.filter((item) => item.relationshipType === 'vecino_principal').length
    const unitDecision: InitialOccupancyUnitDecision = row.unitCode.trim()
      ? row.existingUnitId
        ? 'reuse'
        : row.unitDecision === 'reuse'
          ? 'reuse'
          : 'create'
      : 'unresolved'

    if (!row.fullName.trim()) reasons.push('Falta nombre completo.')
    if (!row.email.trim()) reasons.push('Falta email.')
    if (!row.unitCode.trim()) reasons.push('La unidad requiere revisión.')
    if (row.relationshipType === 'vecino_principal' && principalCount > 1) {
      reasons.push('Hay más de un vecino principal propuesto para esta unidad.')
    }

    let status: InitialOccupancyImportRowStatus = reasons.length === 0 ? 'ready' : 'pending'
    if (!row.fullName.trim() && !row.email.trim() && !row.unitCode.trim()) {
      status = 'error'
    }

    return {
      ...row,
      status,
      statusReason: reasons[0] ?? null,
      unitDecision,
    }
  })

  return {
    ...preview,
    rows,
    summary: {
      totalRows: rows.length,
      readyRows: rows.filter((row) => row.status === 'ready').length,
      pendingRows: rows.filter((row) => row.status === 'pending').length,
      errorRows: rows.filter((row) => row.status === 'error').length,
      unitsToCreate: rows.filter((row) => row.unitDecision === 'create').length,
      unitsToReuse: rows.filter((row) => row.unitDecision === 'reuse').length,
      usersToCreateEstimate: rows.filter((row) => row.status === 'ready').length,
      membershipsToUpsert: rows.filter((row) => row.status === 'ready').length,
    },
  }
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon }: { label: string; value: number; sub: string; icon: typeof Shield }) {
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
function Badge({ children, color = 'default' }: { children: React.ReactNode; color?: 'default' | 'primary' | 'success' | 'warn' }) {
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
function SectionHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
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
function OccupancyBar({ rate }: { rate: number }) {
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

function getRoleCreationCopy(role: string) {
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

function describeAdminAssignment(admin: SuperAdminConsorcioAdminOption | null) {
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
function BuildingsList({
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
function BuildingDetail({ building, onBack }: { building: SuperAdminBuildingDetail; onBack: () => void }) {
  return (
    <div>
      <SectionHeader
        title={building.name}
        subtitle={building.address}
        onBack={onBack}
      />

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Admins */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">
              Usuario Encargado del Consorcio
            </h3>
          </div>
          {building.admins.length === 0 ? (
            <div className="px-5 py-8 text-center text-muted-foreground text-sm">
              Sin administrador asignado
            </div>
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
            <div className="px-5 py-8 text-center text-muted-foreground text-sm">
              Sin administración asociada todavía.
            </div>
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
          <h3 className="font-semibold text-sm text-foreground">
            Residentes Registrados ({building.registeredNeighbors})
          </h3>
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
function BusinessesList({
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
                <div className="text-xs font-bold text-foreground truncate">
                  {business.topBuilding ?? '—'}
                </div>
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
          <div className="col-span-2 text-center py-12 text-muted-foreground text-sm">
            No hay negocios registrados.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── NEGOCIO DETAIL ───────────────────────────────────────────────────────────
function BusinessDetail({ business, onBack }: { business: SuperAdminBusinessDetail; onBack: () => void }) {
  return (
    <div>
      <SectionHeader title={business.name} subtitle={business.category} onBack={onBack} />

      {/* Header card */}
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

      {/* Promotions */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground">
            Cupones y Promociones ({business.promotions.length})
          </h3>
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
function PromotionRow({ promotion }: { promotion: SuperAdminPromotionDetail }) {
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
                {isExpired ? (
                  <Badge color="warn">Vencido</Badge>
                ) : (
                  <Badge color="success">Activo</Badge>
                )}
                <ChevronRight
                  className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
                />
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-xs text-muted-foreground">
                {promotion.usageCount} canje{promotion.usageCount !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-muted-foreground">
                Vence: {promotion.expirationDate}
              </span>
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
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Uso por country
                </p>
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
interface DashboardStats {
  usersByRole: { role: string; label: string; count: number }[]
  avgOccupancy: number
  activePromotions: number
  expiredPromotions: number
  totalRedemptions: number
  buildingsWithoutAdmin: number
  top5Buildings: { name: string; occupancyRate: number }[]
  top5Businesses: { name: string; totalRedemptions: number }[]
}

function computeDashboardStats(data: SuperAdminDashboardData): DashboardStats {
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

// ─── Platform Health Row ──────────────────────────────────────────────────────
function PlatformHealthRow({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Ocupación promedio" value={stats.avgOccupancy} sub="% promedio plataforma" icon={TrendingUp} />
      <StatCard label="Promociones activas" value={stats.activePromotions} sub={`${stats.expiredPromotions} vencidas`} icon={Tag} />
      <StatCard label="Canjes totales" value={stats.totalRedemptions} sub="registros acumulados" icon={CheckCircle} />
      <StatCard label="Sin administrador" value={stats.buildingsWithoutAdmin} sub="consorcios sin encargado" icon={AlertTriangle} />
    </div>
  )
}

// ─── Users by Role Chart ──────────────────────────────────────────────────────
function UsersByRoleChart({ data }: { data: DashboardStats['usersByRole'] }) {
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

// ─── Top Buildings Chart ──────────────────────────────────────────────────────
function TopBuildingsChart({ data }: { data: DashboardStats['top5Buildings'] }) {
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

// ─── Top Businesses Chart ─────────────────────────────────────────────────────
function TopBusinessesChart({ data }: { data: DashboardStats['top5Businesses'] }) {
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

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export function SuperAdminDashboard({ data }: { data: SuperAdminDashboardData }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [importPending, startImportTransition] = useTransition()
  const [userDraft, setUserDraft] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: 'Countrify2026!',
    role: 'vecino',
    buildingId: '',
    businessId: '',
  })
  const [businessDraft, setBusinessDraft] = useState({
    businessName: '',
    category: '',
    description: '',
    address: '',
    adminFullName: '',
    adminEmail: '',
    adminPhone: '',
    adminPassword: 'Countrify2026!',
  })
  const [consorcioDraft, setConsorcioDraft] = useState({
    buildingName: '',
    buildingAddress: '',
    totalUnits: '',
    latitude: '',
    longitude: '',
    administrationName: '',
    administrationLegalName: '',
    administrationTaxId: '',
    administrationContactEmail: '',
    administrationContactPhone: '',
    displayName: '',
    propertyKind: 'consorcio' as IAdminPropertyKind,
    propertyTaxId: '',
    managedSince: '',
    managementFeePct: '',
    notes: '',
    adminProfileId: '',
  })
  const [consorcioStepIndex, setConsorcioStepIndex] = useState(0)
  const [administrationNameTouched, setAdministrationNameTouched] = useState(false)
  const [consorcioLocationSearching, setConsorcioLocationSearching] = useState(false)
  const [importStep, setImportStep] = useState<ImportWizardStep>('building')
  const [selectedImportBuildingId, setSelectedImportBuildingId] = useState('')
  const [importFile, setImportFile] = useState<{ fileName: string; mimeType: string; fileBase64: string } | null>(null)
  const [importPreview, setImportPreview] = useState<InitialOccupancyImportPreview | null>(null)

  const totalUsage = data.promotions.reduce((sum, p) => sum + p.usageCount, 0)
  const consorcioAdmins = data.consorcioAdminOptions
  const activeTabParam = searchParams.get('tab')
  const activeTab: TabType = ['buildings', 'users', 'businesses', 'promotions'].includes(activeTabParam ?? '')
    ? (activeTabParam as TabType)
    : 'overview'
  const selectedBuildingId = searchParams.get('buildingId')
  const selectedBusinessId = searchParams.get('businessId')
  const selectedBuilding =
    activeTab === 'buildings' && selectedBuildingId
      ? data.buildings.find((building) => building.id === selectedBuildingId) ?? null
      : null
  const selectedBusiness =
    activeTab === 'businesses' && selectedBusinessId
      ? data.businesses.find((business) => business.id === selectedBusinessId) ?? null
      : null
  const isConsorcioAdminDraft = userDraft.role === 'consorcio_admin'
  const needsDirectBuilding = userDraft.role === 'vecino' || userDraft.role === 'propietario'
  const needsBusiness = userDraft.role === 'negocio_admin'
  const roleCreationCopy = getRoleCreationCopy(userDraft.role)
  const currentConsorcioStep = CONSORCIO_WIZARD_STEPS[consorcioStepIndex]
  const selectedConsorcioAdmin =
    consorcioAdmins.find((admin) => admin.profileId === consorcioDraft.adminProfileId) ?? null
  const consorcioMapLocation =
    consorcioDraft.latitude && consorcioDraft.longitude
      ? [Number(consorcioDraft.latitude.replace(',', '.')), Number(consorcioDraft.longitude.replace(',', '.'))] as [number, number]
      : null
  const administrationSummaryName = consorcioDraft.administrationName.trim() || consorcioDraft.buildingName.trim()
  const hasAdministrationCustomData =
    administrationNameTouched ||
    Boolean(
      consorcioDraft.administrationLegalName.trim() ||
        consorcioDraft.administrationTaxId.trim() ||
        consorcioDraft.administrationContactEmail.trim() ||
        consorcioDraft.administrationContactPhone.trim(),
    )
  const selectedImportBuilding = data.buildings.find((building) => building.id === selectedImportBuildingId) ?? null
  const stats = computeDashboardStats(data)

  const tabs: { key: TabType; label: string; icon: typeof Shield }[] = [
    { key: 'overview', label: 'Resumen', icon: Shield },
    { key: 'buildings', label: 'Consorcios', icon: Home },
    { key: 'users', label: 'Usuarios', icon: Users },
    { key: 'businesses', label: 'Negocios', icon: Building2 },
    { key: 'promotions', label: 'Promociones', icon: Tag },
  ]

  function navigate(tab: TabType, options?: { buildingId?: string; businessId?: string }) {
    const params = new URLSearchParams()
    if (tab !== 'overview') {
      params.set('tab', tab)
    }
    if (tab === 'buildings' && options?.buildingId) {
      params.set('buildingId', options.buildingId)
    }
    if (tab === 'businesses' && options?.businessId) {
      params.set('businessId', options.businessId)
    }
    const query = params.toString()
    router.replace(query ? `/superadmin?${query}` : '/superadmin')
  }

  function handleTabChange(tab: TabType) {
    navigate(tab)
  }

  function resetConsorcioDraft() {
    setConsorcioDraft({
      buildingName: '',
      buildingAddress: '',
      totalUnits: '',
      latitude: '',
      longitude: '',
      administrationName: '',
      administrationLegalName: '',
      administrationTaxId: '',
      administrationContactEmail: '',
      administrationContactPhone: '',
      displayName: '',
      propertyKind: 'consorcio',
      propertyTaxId: '',
      managedSince: '',
      managementFeePct: '',
      notes: '',
      adminProfileId: '',
    })
    setAdministrationNameTouched(false)
    setConsorcioStepIndex(0)
  }

  function updateBuildingName(value: string) {
    setConsorcioDraft((current) => ({
      ...current,
      buildingName: value,
      administrationName: administrationNameTouched ? current.administrationName : value,
    }))
  }

  function updateUserRole(nextRole: string) {
    setUserDraft((current) => ({
      ...current,
      role: nextRole,
      buildingId: nextRole === 'vecino' || nextRole === 'propietario' ? current.buildingId : '',
      businessId: nextRole === 'negocio_admin' ? current.businessId : '',
    }))
  }

  async function locateConsorcioAddress() {
    if (!consorcioDraft.buildingAddress.trim()) {
      toast.error('Ingresa una direccion antes de ubicar el country.')
      return
    }

    setConsorcioLocationSearching(true)
    toast.loading('Buscando direccion...', { id: 'consorcio-geocode' })

    try {
      const query = encodeURIComponent(`${consorcioDraft.buildingAddress}, San Miguel de Tucuman, Argentina`)
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`)
      const data = await response.json()

      if (Array.isArray(data) && data.length > 0) {
        setConsorcioDraft((current) => ({
          ...current,
          latitude: String(parseFloat(data[0].lat)),
          longitude: String(parseFloat(data[0].lon)),
        }))
        toast.success('Ubicacion aproximada encontrada.', { id: 'consorcio-geocode' })
      } else {
        toast.error('No pudimos ubicarla. Puedes marcar el punto manualmente en el mapa.', { id: 'consorcio-geocode' })
      }
    } catch {
      toast.error('Error buscando la direccion.', { id: 'consorcio-geocode' })
    } finally {
      setConsorcioLocationSearching(false)
    }
  }

  function getConsorcioStepError(stepIndex = consorcioStepIndex) {
    const step = CONSORCIO_WIZARD_STEPS[stepIndex]

    if (step.id === 'building') {
      if (!consorcioDraft.buildingName.trim()) return 'Completa el nombre del country.'
      if (!consorcioDraft.buildingAddress.trim()) return 'Completa la direccion del country.'
      if (!consorcioDraft.totalUnits.trim()) return 'Indica la cantidad total de unidades.'

      const totalUnits = Number(consorcioDraft.totalUnits)
      if (!Number.isFinite(totalUnits) || totalUnits < 0) return 'La cantidad total de unidades es invalida.'

      if (consorcioDraft.latitude && !Number.isFinite(Number(consorcioDraft.latitude.replace(',', '.')))) {
        return 'La latitud es invalida.'
      }

      if (consorcioDraft.longitude && !Number.isFinite(Number(consorcioDraft.longitude.replace(',', '.')))) {
        return 'La longitud es invalida.'
      }
    }

    if (step.id === 'property') {
      if (!consorcioDraft.propertyKind) return 'Selecciona el tipo de consorcio.'

      if (consorcioDraft.managementFeePct) {
        const fee = Number(consorcioDraft.managementFeePct.replace(',', '.'))
        if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
          return 'El fee de administracion debe estar entre 0 y 100.'
        }
      }
    }

    if (step.id === 'admin') {
      if (consorcioAdmins.length === 0) return 'Primero debes crear al menos un usuario admin consorcio.'
      if (!consorcioDraft.adminProfileId) return 'Selecciona el administrador inicial.'
    }

    return null
  }

  function goToConsorcioStep(targetIndex: number) {
    if (targetIndex <= consorcioStepIndex) {
      setConsorcioStepIndex(targetIndex)
      return
    }

    for (let index = 0; index < targetIndex; index += 1) {
      const error = getConsorcioStepError(index)
      if (error) {
        toast.error(error)
        setConsorcioStepIndex(index)
        return
      }
    }

    setConsorcioStepIndex(targetIndex)
  }

  function nextConsorcioStep() {
    const error = getConsorcioStepError()
    if (error) {
      toast.error(error)
      return
    }

    setConsorcioStepIndex((current) => Math.min(current + 1, CONSORCIO_WIZARD_STEPS.length - 1))
  }

  function previousConsorcioStep() {
    setConsorcioStepIndex((current) => Math.max(current - 1, 0))
  }

  function resetImportFlow() {
    setImportStep('building')
    setSelectedImportBuildingId('')
    setImportFile(null)
    setImportPreview(null)
  }

  async function handleImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      setImportFile(null)
      return
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['xlsx', 'xls', 'csv'].includes(extension)) {
      toast.error('Solo se admiten archivos .xlsx, .xls o .csv.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    const result = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

    const base64 = result.split(',')[1] ?? ''
    setImportFile({
      fileName: file.name,
      mimeType:
        file.type ||
        (extension === 'csv'
          ? 'text/csv'
          : extension === 'xls'
            ? 'application/vnd.ms-excel'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      fileBase64: base64,
    })
    setImportPreview(null)
  }

  function updateImportPreviewRow(rowId: string, patch: Partial<InitialOccupancyImportRowDraft>) {
    setImportPreview((current) => {
      if (!current) return current
      const next = {
        ...current,
        rows: current.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
      }
      return recomputeImportPreview(next)
    })
  }

  function analyzeImportFile() {
    if (!selectedImportBuildingId) {
      toast.error('Selecciona primero el country destino.')
      return
    }
    if (!importFile) {
      toast.error('Sube primero el archivo a procesar.')
      return
    }

    startImportTransition(async () => {
      try {
        const preview = await analyzeInitialOccupancyFile({
          buildingId: selectedImportBuildingId,
          fileName: importFile.fileName,
          mimeType: importFile.mimeType,
          fileBase64: importFile.fileBase64,
        })
        setImportPreview(recomputeImportPreview(preview))
        setImportStep('review')
        toast.success('La planilla fue interpretada. Revisa la propuesta antes de importar.')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No pudimos analizar el archivo.')
      }
    })
  }

  function confirmImportPreview() {
    if (!importPreview) {
      toast.error('Primero debes analizar una planilla.')
      return
    }

    startImportTransition(async () => {
      try {
        const result = await confirmInitialOccupancyImport({
          buildingId: importPreview.buildingId,
          rows: importPreview.rows,
        })

        if (result.errors.length > 0) {
          toast(`Importación parcial: ${result.linkedMemberships} vínculos listos, ${result.errors.length} filas con error.`)
          console.warn('Errores importación IA', result.errors)
        } else {
          toast.success(
            `Importación lista: ${result.createdUsers} usuarios, ${result.createdUnits} unidades y ${result.linkedMemberships + result.updatedMemberships} vínculos procesados.`,
          )
        }

        resetImportFlow()
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No pudimos confirmar la importación.')
      }
    })
  }

  function submitUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      try {
        await createPlatformUser({
          fullName: userDraft.fullName,
          email: userDraft.email,
          phone: userDraft.phone || null,
          password: userDraft.password,
          role: userDraft.role as UserRole,
          buildingId: needsDirectBuilding ? userDraft.buildingId || null : null,
          businessId: needsBusiness ? userDraft.businessId || null : null,
        })
        toast.success(
          userDraft.role === 'consorcio_admin'
            ? 'Admin consorcio creado. Puedes asignarle countries desde el alta de consorcio.'
            : 'Usuario creado',
        )
        setUserDraft({ fullName: '', email: '', phone: '', password: 'Countrify2026!', role: 'vecino', buildingId: '', businessId: '' })
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function submitBusiness(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      try {
        await createBusinessWithAdmin({
          businessName: businessDraft.businessName,
          category: businessDraft.category,
          description: businessDraft.description,
          address: businessDraft.address || null,
          adminFullName: businessDraft.adminFullName,
          adminEmail: businessDraft.adminEmail,
          adminPhone: businessDraft.adminPhone || null,
          adminPassword: businessDraft.adminPassword,
        })
        toast.success('Negocio y administrador creados')
        setBusinessDraft({
          businessName: '',
          category: '',
          description: '',
          address: '',
          adminFullName: '',
          adminEmail: '',
          adminPhone: '',
          adminPassword: 'Countrify2026!',
        })
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function submitConsorcio(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      try {
        const totalUnits = Number(consorcioDraft.totalUnits)
        const latitude = consorcioDraft.latitude ? Number(consorcioDraft.latitude.replace(',', '.')) : null
        const longitude = consorcioDraft.longitude ? Number(consorcioDraft.longitude.replace(',', '.')) : null
        const managementFeePct = consorcioDraft.managementFeePct
          ? Number(consorcioDraft.managementFeePct.replace(',', '.'))
          : null

        if (!Number.isFinite(totalUnits) || totalUnits < 0) {
          throw new Error('La cantidad total de unidades es invalida.')
        }

        if (latitude !== null && !Number.isFinite(latitude)) {
          throw new Error('La latitud es invalida.')
        }

        if (longitude !== null && !Number.isFinite(longitude)) {
          throw new Error('La longitud es invalida.')
        }

        if (managementFeePct !== null && (!Number.isFinite(managementFeePct) || managementFeePct < 0 || managementFeePct > 100)) {
          throw new Error('El fee de administracion debe estar entre 0 y 100.')
        }

        const result = await createManagedProperty({
          building: {
            name: consorcioDraft.buildingName,
            address: consorcioDraft.buildingAddress,
            totalUnits,
            latitude,
            longitude,
          },
          administration: {
            name: consorcioDraft.administrationName.trim() || consorcioDraft.buildingName,
            legalName: consorcioDraft.administrationLegalName.trim() || null,
            taxId: consorcioDraft.administrationTaxId.trim() || null,
            contactEmail: consorcioDraft.administrationContactEmail.trim() || null,
            contactPhone: consorcioDraft.administrationContactPhone.trim() || null,
          },
          managedProperty: {
            displayName: consorcioDraft.displayName || null,
            propertyKind: consorcioDraft.propertyKind,
            taxId: consorcioDraft.propertyTaxId || null,
            managedSince: consorcioDraft.managedSince || null,
            managementFeePct,
            notes: consorcioDraft.notes || null,
          },
          adminProfileId: consorcioDraft.adminProfileId,
        })

        toast.success('Consorcio creado y listo para IAdmin')
        resetConsorcioDraft()
        navigate('buildings', { buildingId: result.buildingId })
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4 text-primary" />
          <p className="text-xs text-primary font-medium tracking-wider uppercase">Panel de super administrador</p>
        </div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Resumen operativo de la plataforma</h1>
        <p className="text-muted-foreground text-sm mt-1">Datos en tiempo real desde Supabase.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-8 w-fit flex-wrap" style={{ background: 'rgba(0,0,0,0.03)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key ? 'text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
            style={activeTab === tab.key ? { background: 'linear-gradient(135deg, #112250, #0a1838)' } : {}}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Usuarios" value={data.users.length} sub={`${data.users.filter((u) => u.role === 'vecino').length} residentes · ${data.users.filter((u) => u.role === 'propietario').length} propietarios`} icon={Users} />
            <StatCard label="Consorcios" value={data.buildings.length} sub="Countries adheridos" icon={Home} />
            <StatCard label="Negocios" value={data.businesses.length} sub={`${data.users.filter((u) => u.role === 'negocio_admin').length} admins`} icon={Building2} />
            <StatCard label="Canjes registrados" value={totalUsage} sub="Desde promotion_redemptions" icon={TrendingUp} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'buildings', label: 'Consorcios', desc: `${data.buildings.length} countries adheridos`, icon: Home },
              { key: 'users', label: 'Usuarios', desc: `${data.users.length} cuentas registradas`, icon: Users },
              { key: 'businesses', label: 'Negocios', desc: `${data.businesses.length} negocios adheridos`, icon: Building2 },
              { key: 'promotions', label: 'Promociones', desc: `${data.promotions.length} promociones cargadas`, icon: Tag },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => handleTabChange(item.key as TabType)}
                className="glass-card glass-card-hover rounded-xl p-5 text-left group flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(156,156,156,0.15)', border: '1px solid rgba(0,0,0,0.06)' }}
                  >
                    <item.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground text-sm">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.desc}</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
          </div>

          {/* Salud de la Plataforma */}
          <div className="mt-8">
            <h3 className="font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Salud de la Plataforma
            </h3>
            <PlatformHealthRow stats={stats} />
          </div>

          {/* Análisis de Plataforma */}
          <div className="mt-6">
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
      )}

      {/* CONSORCIOS */}
      {activeTab === 'buildings' && !selectedBuilding && (
        <div className="space-y-5">
          <form onSubmit={submitConsorcio} className="glass-card rounded-xl p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-primary">Wizard de alta</div>
                <h3 className="mt-1 text-sm font-semibold text-foreground">Nuevo consorcio / country</h3>
                <p className="sr-only">
                Crea el country, la administración, la propiedad IAdmin y deja asignado el admin de consorcio en una sola acción.
              </p>
                <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                  Crea el country, la administracion y la configuracion IAdmin con un flujo guiado y deja asignado el admin
                  consorcio en una sola accion.
                </p>
              </div>
              <div className="rounded-full border border-border/40 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                Paso {consorcioStepIndex + 1} de {CONSORCIO_WIZARD_STEPS.length}
              </div>
            </div>

            <div className="mt-5 grid gap-2 md:grid-cols-5">
              {CONSORCIO_WIZARD_STEPS.map((step, index) => {
                const isActive = index === consorcioStepIndex
                const isCompleted = index < consorcioStepIndex

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToConsorcioStep(index)}
                    className={`rounded-xl border px-3 py-3 text-left transition-all ${
                      isActive
                        ? 'border-primary/40 bg-primary/10'
                        : isCompleted
                          ? 'border-border/60 bg-background/80'
                          : 'border-border/40 bg-background/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="flex items-center gap-2">
                        {step.optional && <Badge color="default">Opcional</Badge>}
                        {isCompleted && <Badge color="success">Listo</Badge>}
                      </div>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-foreground">{step.label}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 space-y-5 rounded-2xl border border-border/40 bg-background/70 p-4">
              <div className="mb-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-primary">{currentConsorcioStep.label}</p>
                  {currentConsorcioStep.optional && <Badge color="default">Opcional</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{currentConsorcioStep.description}</p>
              </div>
              {currentConsorcioStep.id === 'building' && (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Country</p>
                    <p className="text-xs text-muted-foreground">
                      Carga el nombre, la direccion y marca la ubicacion en el mapa para dejar el consorcio listo desde el alta.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      placeholder="Nombre del country"
                      value={consorcioDraft.buildingName}
                      onChange={(e) => updateBuildingName(e.target.value)}
                      required
                    />
                    <Input
                      placeholder="Unidades totales"
                      inputMode="numeric"
                      value={consorcioDraft.totalUnits}
                      onChange={(e) => setConsorcioDraft({ ...consorcioDraft, totalUnits: e.target.value })}
                      required
                    />
                  </div>

                  <div className="glass-card rounded-2xl p-4 overflow-hidden relative">
                    <div className="flex flex-col gap-6 lg:flex-row">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-primary" />
                          Ubicacion del country
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Busca la direccion y, si hace falta, corrige manualmente el punto haciendo click en el mapa.
                        </p>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Direccion</Label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Input
                                value={consorcioDraft.buildingAddress}
                                onChange={(event) =>
                                  setConsorcioDraft({ ...consorcioDraft, buildingAddress: event.target.value })
                                }
                                placeholder="Ej. Av. Sarmiento 2555"
                                required
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={locateConsorcioAddress}
                                disabled={consorcioLocationSearching || !consorcioDraft.buildingAddress.trim()}
                              >
                                {consorcioLocationSearching ? 'Ubicando...' : 'Ubicar'}
                              </Button>
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Si no encontramos la direccion exacta, puedes elegir la ubicacion manualmente sobre el mapa.
                          </p>
                        </div>
                      </div>

                      <div className="flex-[1.35] overflow-hidden rounded-2xl border border-border/60 bg-background">
                        <div className="h-[320px]">
                          <DynamicMap
                            center={consorcioMapLocation ?? [-26.8306, -65.2038]}
                            zoom={consorcioMapLocation ? 16 : 13}
                            interactive
                            selectedLocation={consorcioMapLocation}
                            onLocationSelect={(lat, lng) =>
                              setConsorcioDraft((current) => ({
                                ...current,
                                latitude: String(lat),
                                longitude: String(lng),
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {currentConsorcioStep.id === 'administration' && (
                <div className="space-y-5">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        Quién administra
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Si no completas este paso, Countrify creará una administración mínima usando el nombre del country.
                        Luego podrás editarla desde el detalle del consorcio.
                      </p>
                    </div>
                    <Badge color="default">Opcional</Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                      placeholder="Nombre de la administración"
                      value={consorcioDraft.administrationName}
                      onChange={(event) => {
                        setAdministrationNameTouched(true)
                        setConsorcioDraft({ ...consorcioDraft, administrationName: event.target.value })
                      }}
                    />
                    <Input
                      placeholder="Razón social"
                      value={consorcioDraft.administrationLegalName}
                      onChange={(event) =>
                        setConsorcioDraft({ ...consorcioDraft, administrationLegalName: event.target.value })
                      }
                    />
                    <Input
                      placeholder="CUIT"
                      value={consorcioDraft.administrationTaxId}
                      onChange={(event) =>
                        setConsorcioDraft({ ...consorcioDraft, administrationTaxId: event.target.value })
                      }
                    />
                    <Input
                      placeholder="Email"
                      type="email"
                      value={consorcioDraft.administrationContactEmail}
                      onChange={(event) =>
                        setConsorcioDraft({ ...consorcioDraft, administrationContactEmail: event.target.value })
                      }
                    />
                    <Input
                      placeholder="Teléfono"
                      value={consorcioDraft.administrationContactPhone}
                      onChange={(event) =>
                        setConsorcioDraft({ ...consorcioDraft, administrationContactPhone: event.target.value })
                      }
                    />
                  </div>
                </div>
              )}
              {currentConsorcioStep.id === 'property' && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Configuración del consorcio</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                    placeholder="Nombre a mostrar (opcional)"
                    value={consorcioDraft.displayName}
                    onChange={(e) => setConsorcioDraft({ ...consorcioDraft, displayName: e.target.value })}
                  />
                  <select
                    className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                    value={consorcioDraft.propertyKind}
                    onChange={(e) => setConsorcioDraft({ ...consorcioDraft, propertyKind: e.target.value as IAdminPropertyKind })}
                  >
                    {PROPERTY_KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <input
                    className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                    placeholder="CUIT del consorcio"
                    value={consorcioDraft.propertyTaxId}
                    onChange={(e) => setConsorcioDraft({ ...consorcioDraft, propertyTaxId: e.target.value })}
                  />
                  <input
                    className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                    placeholder="Inicio de gestión"
                    type="date"
                    value={consorcioDraft.managedSince}
                    onChange={(e) => setConsorcioDraft({ ...consorcioDraft, managedSince: e.target.value })}
                  />
                  <input
                    className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                    placeholder="Fee administración (%)"
                    inputMode="decimal"
                    value={consorcioDraft.managementFeePct}
                    onChange={(e) => setConsorcioDraft({ ...consorcioDraft, managementFeePct: e.target.value })}
                  />
                  <textarea
                    className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm outline-none md:col-span-3"
                    rows={2}
                    placeholder="Notas iniciales"
                    value={consorcioDraft.notes}
                    onChange={(e) => setConsorcioDraft({ ...consorcioDraft, notes: e.target.value })}
                  />
                </div>
              </div>
              )}

              {currentConsorcioStep.id === 'admin' && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Administrador inicial</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                  <select
                    className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                    value={consorcioDraft.adminProfileId}
                    onChange={(e) => setConsorcioDraft({ ...consorcioDraft, adminProfileId: e.target.value })}
                    required
                  >
                    <option value="">Seleccionar admin consorcio</option>
                    {consorcioAdmins.map((admin) => (
                      <option key={admin.profileId} value={admin.profileId}>
                        {admin.fullName} · {admin.email}
                      </option>
                    ))}
                  </select>
                  <div className="hidden">
                    {consorcioAdmins.length === 0
                      ? 'Primero necesitas crear al menos un usuario con rol admin consorcio.'
                      : 'Si el admin no tiene otros countries asignados, este nuevo consorcio quedará como principal.'}
                  </div>
                  <div className="md:col-span-2 rounded-lg border border-border/40 bg-background/60 px-3 py-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {selectedConsorcioAdmin ? selectedConsorcioAdmin.fullName : 'Sin admin seleccionado'}
                    </p>
                    <p className="mt-1">{describeAdminAssignment(selectedConsorcioAdmin)}</p>
                    {selectedConsorcioAdmin && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge color="default">
                          {selectedConsorcioAdmin.assignedBuildingsCount} country
                          {selectedConsorcioAdmin.assignedBuildingsCount === 1 ? '' : 's'}
                        </Badge>
                        {selectedConsorcioAdmin.primaryBuildingName && (
                          <Badge color="primary">Primario: {selectedConsorcioAdmin.primaryBuildingName}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              )}

              {currentConsorcioStep.id === 'summary' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resumen y confirmacion</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Revisa todo antes de crear. Si algo no esta bien, puedes volver al paso anterior sin perder lo cargado.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-border/40 bg-background/60 p-4">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Country</div>
                      <div className="mt-2 text-sm font-semibold text-foreground">{consorcioDraft.buildingName || 'Sin nombre'}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{consorcioDraft.buildingAddress || 'Sin direccion'}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Unidades: {consorcioDraft.totalUnits || '0'}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Ubicacion:{' '}
                        {consorcioMapLocation
                          ? `${consorcioMapLocation[0].toFixed(5)}, ${consorcioMapLocation[1].toFixed(5)}`
                          : 'sin coordenadas seleccionadas'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/60 p-4">
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Quién administra
                        </div>
                        <Badge color="default">Opcional</Badge>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-foreground">
                        {administrationSummaryName || 'Se usará el nombre del country'}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {hasAdministrationCustomData
                          ? 'Se guardarán los datos cargados para la administración.'
                          : 'Si no completas este paso, se creará automáticamente con el nombre del country.'}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {consorcioDraft.administrationContactEmail.trim() || 'Sin email'}
                        {consorcioDraft.administrationContactPhone.trim()
                          ? ` · ${consorcioDraft.administrationContactPhone.trim()}`
                          : ''}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {consorcioDraft.administrationLegalName.trim() || 'Sin razón social'}
                        {consorcioDraft.administrationTaxId.trim()
                          ? ` · CUIT ${consorcioDraft.administrationTaxId.trim()}`
                          : ''}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/60 p-4">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Datos del consorcio en Countrify
                      </div>
                      <div className="mt-2 text-sm font-semibold text-foreground">
                        {consorcioDraft.displayName || consorcioDraft.buildingName || 'Se usara el nombre del country'}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Tipo: {PROPERTY_KIND_OPTIONS.find((option) => option.value === consorcioDraft.propertyKind)?.label}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {consorcioDraft.managedSince ? `Gestion desde ${consorcioDraft.managedSince}` : 'Sin fecha inicial'}
                        {consorcioDraft.managementFeePct ? ` · Fee ${consorcioDraft.managementFeePct}%` : ''}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/60 p-4">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Administrador inicial
                      </div>
                      <div className="mt-2 text-sm font-semibold text-foreground">
                        {selectedConsorcioAdmin?.fullName || 'Sin admin seleccionado'}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedConsorcioAdmin?.email || 'Debes seleccionar un admin consorcio'}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">{describeAdminAssignment(selectedConsorcioAdmin)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-border/40 pt-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <button
                  type="button"
                  onClick={resetConsorcioDraft}
                  className="rounded-lg border border-border/50 px-3 py-2 text-xs font-semibold text-muted-foreground"
                >
                  Limpiar wizard
                </button>
                {getConsorcioStepError() && <p className="text-xs text-amber-700">{getConsorcioStepError()}</p>}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {consorcioStepIndex > 0 && (
                  <button
                    type="button"
                    onClick={previousConsorcioStep}
                    className="rounded-lg border border-border/50 px-4 py-2 text-sm font-semibold text-foreground"
                  >
                    Volver
                  </button>
                )}
                {currentConsorcioStep.id !== 'summary' ? (
                  <button
                    type="button"
                    onClick={nextConsorcioStep}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium"
                  >
                    Continuar
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={pending || consorcioAdmins.length === 0}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium disabled:opacity-60"
                  >
                    {pending ? 'Creando...' : 'Crear consorcio'}
                  </button>
                )}
              </div>
            </div>
          </form>

          <BuildingsList buildings={data.buildings} onSelect={(building) => navigate('buildings', { buildingId: building.id })} />
        </div>
      )}
      {activeTab === 'buildings' && selectedBuilding && (
        <BuildingDetail building={selectedBuilding} onBack={() => navigate('buildings')} />
      )}

      {/* USUARIOS */}
      {activeTab === 'users' && (
        <div>
          <SectionHeader title="Usuarios" subtitle={`${data.users.length} cuentas registradas`} />
          <form onSubmit={submitUser} className="glass-card rounded-xl p-5 mb-5">
            <div className="mb-4">
              <h3 className="font-semibold text-foreground text-sm">Crear usuario manual</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Crea la cuenta base y despues completa sus vinculos operativos segun el rol. Para residentes y propietarios, la
                asociacion fina a la unidad se termina desde IAdmin.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Nombre completo" value={userDraft.fullName} onChange={(e) => setUserDraft({ ...userDraft, fullName: e.target.value })} required />
              <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Email" type="email" value={userDraft.email} onChange={(e) => setUserDraft({ ...userDraft, email: e.target.value })} required />
              <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Telefono" value={userDraft.phone} onChange={(e) => setUserDraft({ ...userDraft, phone: e.target.value })} />
              <select className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" value={userDraft.role} onChange={(e) => updateUserRole(e.target.value)}>
                <option value="vecino">Vecino</option>
                <option value="propietario">Propietario</option>
                <option value="consorcio_admin">Admin consorcio</option>
                <option value="negocio_admin">Admin negocio</option>
                <option value="super_admin">Super admin</option>
              </select>
              {needsDirectBuilding && (
                <select className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" value={userDraft.buildingId} onChange={(e) => setUserDraft({ ...userDraft, buildingId: e.target.value })}>
                  <option value="">Sin country directo</option>
                  {data.buildings.map((building) => (
                    <option key={building.id} value={building.id}>{building.name}</option>
                  ))}
                </select>
              )}
              {needsBusiness && (
                <select className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" value={userDraft.businessId} onChange={(e) => setUserDraft({ ...userDraft, businessId: e.target.value })}>
                  <option value="">Seleccionar negocio</option>
                  {data.businesses.map((business) => (
                    <option key={business.id} value={business.id}>{business.name}</option>
                  ))}
                </select>
              )}
              <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Password temporal" value={userDraft.password} onChange={(e) => setUserDraft({ ...userDraft, password: e.target.value })} required />
            </div>
            <div className="mt-4 rounded-xl border border-border/40 bg-background/60 p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-primary">{roleCreationCopy.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{roleCreationCopy.body}</p>
              {isConsorcioAdminDraft && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Esta vista ya no te pide un country unico para el admin. La asignacion de cada consorcio se hace despues
                  desde la creacion del country.
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium">
                {pending ? 'Creando...' : 'Crear usuario'}
              </button>
            </div>
          </form>
          <div className="glass-card rounded-xl p-5 mb-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="font-semibold text-foreground text-sm">Importación asistida con IA</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sube un Excel o CSV de un solo country. Countrify interpretará la planilla, propondrá unidades y relaciones,
                  y te dejará revisar todo antes de importar.
                </p>
              </div>
              <button
                type="button"
                onClick={resetImportFlow}
                className="rounded-lg border border-border/50 px-3 py-2 text-xs font-semibold text-muted-foreground"
              >
                Reiniciar flujo
              </button>
            </div>

            <div className="grid gap-2 md:grid-cols-4">
              {IMPORT_STEP_LABELS.map((step, index) => {
                const activeIndex = IMPORT_STEP_LABELS.findIndex((item) => item.id === importStep)
                const isActive = step.id === importStep
                const isCompleted = index < activeIndex

                return (
                  <div
                    key={step.id}
                    className={`rounded-xl border px-3 py-3 ${
                      isActive
                        ? 'border-primary/40 bg-primary/10'
                        : isCompleted
                          ? 'border-border/60 bg-background/80'
                          : 'border-border/40 bg-background/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {isCompleted && <Badge color="success">Listo</Badge>}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-foreground">{step.label}</div>
                  </div>
                )
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-border/40 bg-background/70 p-4">
              {importStep === 'building' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seleccionar country</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Esta importación procesa un solo consorcio por archivo. Elige primero el country destino.
                    </p>
                  </div>
                  <select
                    className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                    value={selectedImportBuildingId}
                    onChange={(e) => setSelectedImportBuildingId(e.target.value)}
                  >
                    <option value="">Seleccionar consorcio</option>
                    {data.buildings.map((building) => (
                      <option key={building.id} value={building.id}>
                        {building.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedImportBuildingId) {
                          toast.error('Selecciona un country para continuar.')
                          return
                        }
                        setImportStep('upload')
                      }}
                      className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium"
                    >
                      Continuar
                    </button>
                  </div>
                </div>
              )}

              {importStep === 'upload' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subir archivo</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Country seleccionado: <span className="font-medium text-foreground">{selectedImportBuilding?.name ?? 'Sin country'}</span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/60 p-4">
                    <Label htmlFor="initial-occupancy-file">Archivo Excel o CSV</Label>
                    <input
                      id="initial-occupancy-file"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleImportFileChange}
                      className="mt-2 block w-full text-sm text-muted-foreground"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Soporta `.xlsx`, `.xls` y `.csv`. La IA usará el archivo para detectar columnas y proponer la asignación a unidades.
                    </p>
                    {importFile && (
                      <p className="mt-3 text-xs text-foreground">
                        Archivo listo: <span className="font-medium">{importFile.fileName}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setImportStep('building')}
                      className="rounded-lg border border-border/50 px-4 py-2 text-sm font-semibold text-foreground"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={analyzeImportFile}
                      disabled={importPending || !selectedImportBuildingId || !importFile}
                      className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium disabled:opacity-60"
                    >
                      {importPending ? 'Analizando...' : 'Analizar con IA'}
                    </button>
                  </div>
                </div>
              )}

              {importStep === 'review' && importPreview && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revisar propuesta IA</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Corrige filas pendientes antes de confirmar. Las filas listas se podrán importar tal como están.
                      </p>
                    </div>
                    <Badge color="default">{importPreview.fileName}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                    <div className="rounded-xl border border-border/40 bg-background/60 p-3">
                      <div className="text-xs text-muted-foreground">Filas</div>
                      <div className="mt-1 text-lg font-semibold text-foreground">{importPreview.summary.totalRows}</div>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/60 p-3">
                      <div className="text-xs text-muted-foreground">Listas</div>
                      <div className="mt-1 text-lg font-semibold text-foreground">{importPreview.summary.readyRows}</div>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/60 p-3">
                      <div className="text-xs text-muted-foreground">Pendientes</div>
                      <div className="mt-1 text-lg font-semibold text-foreground">{importPreview.summary.pendingRows}</div>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/60 p-3">
                      <div className="text-xs text-muted-foreground">Unidades nuevas</div>
                      <div className="mt-1 text-lg font-semibold text-foreground">{importPreview.summary.unitsToCreate}</div>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/60 p-3">
                      <div className="text-xs text-muted-foreground">Reutiliza unidades</div>
                      <div className="mt-1 text-lg font-semibold text-foreground">{importPreview.summary.unitsToReuse}</div>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/60 p-3">
                      <div className="text-xs text-muted-foreground">Vínculos</div>
                      <div className="mt-1 text-lg font-semibold text-foreground">{importPreview.summary.membershipsToUpsert}</div>
                    </div>
                  </div>

                  {importPreview.warnings.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-800">
                      <p className="font-semibold uppercase tracking-wider">Advertencias detectadas</p>
                      <ul className="mt-2 space-y-1">
                        {importPreview.warnings.map((warning, index) => (
                          <li key={`${warning}-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-xl border border-border/40">
                    <table className="min-w-full text-sm">
                      <thead className="bg-background/80">
                        <tr className="border-b border-border/50">
                          {['Estado', 'Persona', 'Contacto', 'Unidad', 'Piso', 'Relación', 'Unidad destino', 'Motivo'].map((header) => (
                            <th key={header} className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.rows.map((row) => (
                          <tr key={row.id} className="border-b border-border/30 align-top last:border-0">
                            <td className="px-3 py-3">
                              <Badge color={row.status === 'ready' ? 'success' : row.status === 'pending' ? 'warn' : 'default'}>
                                {row.status === 'ready' ? 'Lista' : row.status === 'pending' ? 'Pendiente' : 'Error'}
                              </Badge>
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                {row.sourceSheet} · línea {row.sourceRowNumber}
                              </p>
                            </td>
                            <td className="px-3 py-3">
                              <Input
                                value={row.fullName}
                                onChange={(event) => updateImportPreviewRow(row.id, { fullName: event.target.value })}
                                className="min-w-[220px]"
                              />
                              <p className="mt-2 text-[11px] text-muted-foreground">{row.rawPreview || 'Sin vista previa original'}</p>
                            </td>
                            <td className="px-3 py-3 space-y-2">
                              <Input
                                value={row.email}
                                onChange={(event) => updateImportPreviewRow(row.id, { email: event.target.value })}
                                placeholder="Email"
                                className="min-w-[220px]"
                              />
                              <Input
                                value={row.phone}
                                onChange={(event) => updateImportPreviewRow(row.id, { phone: event.target.value })}
                                placeholder="Teléfono"
                                className="min-w-[220px]"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <Input
                                value={row.unitCode}
                                onChange={(event) =>
                                  updateImportPreviewRow(row.id, {
                                    unitCode: event.target.value,
                                    existingUnitId: null,
                                    unitDecision: 'create',
                                  })
                                }
                                placeholder="Unidad"
                                className="min-w-[140px]"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <Input
                                value={row.floor ?? ''}
                                onChange={(event) => updateImportPreviewRow(row.id, { floor: event.target.value })}
                                placeholder="Piso"
                                className="min-w-[90px]"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <select
                                className="min-w-[180px] rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                                value={row.relationshipType}
                                onChange={(event) =>
                                  updateImportPreviewRow(row.id, {
                                    relationshipType: event.target.value as UnitProfileRelationship,
                                  })
                                }
                              >
                                {IMPORT_RELATIONSHIP_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-3">
                              <select
                                className="min-w-[150px] rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                                value={row.unitDecision}
                                onChange={(event) =>
                                  updateImportPreviewRow(row.id, {
                                    unitDecision: event.target.value as InitialOccupancyImportRowDraft['unitDecision'],
                                    existingUnitId: event.target.value === 'reuse' ? row.existingUnitId : null,
                                  })
                                }
                              >
                                <option value="reuse">Reutilizar</option>
                                <option value="create">Crear unidad</option>
                                <option value="unresolved">Pendiente</option>
                              </select>
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-xs text-muted-foreground">{row.statusReason ?? 'Sin observaciones'}</p>
                              <p className="mt-2 text-[11px] text-muted-foreground">Confianza IA: {row.confidence}%</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setImportStep('upload')}
                      className="rounded-lg border border-border/50 px-4 py-2 text-sm font-semibold text-foreground"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportStep('confirm')}
                      className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium"
                    >
                      Ir a confirmación
                    </button>
                  </div>
                </div>
              )}

              {importStep === 'confirm' && importPreview && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confirmar importación</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Se importarán únicamente las filas listas. Las pendientes quedarán fuera hasta que vuelvas a revisarlas.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-border/40 bg-background/60 p-4">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Country destino</div>
                      <div className="mt-2 text-sm font-semibold text-foreground">{importPreview.buildingName}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{importPreview.fileName}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/60 p-4">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resultado esperado</div>
                      <p className="mt-2 text-sm font-semibold text-foreground">
                        {importPreview.summary.readyRows} filas listas · {importPreview.summary.pendingRows} pendientes
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {importPreview.summary.unitsToCreate} unidades nuevas · {importPreview.summary.membershipsToUpsert} vínculos a procesar
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setImportStep('review')}
                      className="rounded-lg border border-border/50 px-4 py-2 text-sm font-semibold text-foreground"
                    >
                      Volver a revisar
                    </button>
                    <button
                      type="button"
                      onClick={confirmImportPreview}
                      disabled={importPending || importPreview.summary.readyRows === 0}
                      className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium disabled:opacity-60"
                    >
                      {importPending ? 'Importando...' : 'Confirmar importación'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50" style={{ background: 'rgba(0,0,0,0.03)' }}>
                    {['Usuario', 'Email', 'Rol', 'Teléfono'].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.id} className="border-b border-border/30 last:border-0 hover:bg-secondary/30">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #112250, #0a1838)' }}
                          >
                            {user.avatarText}
                          </div>
                          <span className="font-medium text-foreground">{user.fullName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{user.email}</td>
                      <td className="px-5 py-3.5">
                        <Badge color={user.role === 'super_admin' ? 'primary' : 'default'}>
                          {ROLE_LABELS[user.role]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{user.phone ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* NEGOCIOS */}
      {activeTab === 'businesses' && !selectedBusiness && (
        <div>
          <form onSubmit={submitBusiness} className="glass-card rounded-xl p-5 mb-5">
            <div className="mb-4">
              <h3 className="font-semibold text-foreground text-sm">Crear negocio con administrador</h3>
              <p className="text-xs text-muted-foreground mt-0.5">El negocio queda listo con un usuario `negocio_admin` asociado.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Nombre negocio" value={businessDraft.businessName} onChange={(e) => setBusinessDraft({ ...businessDraft, businessName: e.target.value })} required />
              <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Categoria" value={businessDraft.category} onChange={(e) => setBusinessDraft({ ...businessDraft, category: e.target.value })} required />
              <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Direccion" value={businessDraft.address} onChange={(e) => setBusinessDraft({ ...businessDraft, address: e.target.value })} />
              <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Descripcion" value={businessDraft.description} onChange={(e) => setBusinessDraft({ ...businessDraft, description: e.target.value })} />
              <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Nombre admin" value={businessDraft.adminFullName} onChange={(e) => setBusinessDraft({ ...businessDraft, adminFullName: e.target.value })} required />
              <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Email admin" type="email" value={businessDraft.adminEmail} onChange={(e) => setBusinessDraft({ ...businessDraft, adminEmail: e.target.value })} required />
              <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Telefono admin" value={businessDraft.adminPhone} onChange={(e) => setBusinessDraft({ ...businessDraft, adminPhone: e.target.value })} />
              <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Password temporal" value={businessDraft.adminPassword} onChange={(e) => setBusinessDraft({ ...businessDraft, adminPassword: e.target.value })} required />
              <button type="submit" disabled={pending} className="md:col-span-4 rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium">
                {pending ? 'Creando...' : 'Crear negocio y admin'}
              </button>
            </div>
          </form>
          <BusinessesList businesses={data.businesses} onSelect={(business) => navigate('businesses', { businessId: business.id })} />
        </div>
      )}
      {activeTab === 'businesses' && selectedBusiness && (
        <BusinessDetail business={selectedBusiness} onBack={() => navigate('businesses')} />
      )}

      {/* PROMOCIONES */}
      {activeTab === 'promotions' && (
        <div>
          <SectionHeader title="Promociones" subtitle={`${data.promotions.length} promociones cargadas`} />
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="divide-y divide-border/30">
              {data.promotions.map((promotion) => (
                <PromotionRow key={promotion.id} promotion={promotion as SuperAdminPromotionDetail} />
              ))}
              {data.promotions.length === 0 && (
                <div className="px-5 py-8 text-center text-muted-foreground text-sm">
                  No hay promociones cargadas.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ChatWidget />
    </div>
  )
}
