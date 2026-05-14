import Link from 'next/link'
import { Building2, FileText, Home, Users } from 'lucide-react'
import type {
  BuildingInformationItem,
  IAdminAccountingPeriod,
  IAdminCapability,
  IAdminExpenseStatus,
  IAdminExpenseSummary,
  IAdminManagedProperty,
  IAdminUnitWithHolders,
} from '@/lib/types'
import { Money } from '@/components/admin-backoffice/shared/money'
import { AccountingPeriodCard } from '@/components/admin-backoffice/consorcio/accounting-period-card'
import { ConsorcioLegalForm } from '@/components/admin-backoffice/consorcio/consorcio-legal-form'
import { ConsorcioSettingsForm } from '@/components/admin-backoffice/consorcio/consorcio-settings-form'
import { BuildingInformationManager } from '@/components/admin-backoffice/consorcio/building-information-manager'
import { UnitsManager } from '@/components/admin-backoffice/consorcio/units-manager'

const EXPENSE_STATUS_LABELS: Record<IAdminExpenseStatus, string> = {
  draft: 'Borrador',
  pending_review: 'Pendiente revision',
  needs_doc: 'Falta documento',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  imputed: 'Imputado',
}

const EXPENSE_STATUS_TONE: Record<IAdminExpenseStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_review: 'bg-amber-100 text-amber-800',
  needs_doc: 'bg-orange-100 text-orange-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  imputed: 'bg-sky-100 text-sky-800',
}

type Props = {
  property: IAdminManagedProperty
  units: IAdminUnitWithHolders[]
  recentExpenses: IAdminExpenseSummary[]
  currentPeriod: IAdminAccountingPeriod | null
  buildingInformation: BuildingInformationItem[]
  totals: { units: number; activeHolders: number; monthExpenses: number; monthAmount: number }
  userCapabilities: IAdminCapability[]
}

export function ConsorcioDetail({ property, units, recentExpenses, currentPeriod, buildingInformation, totals, userCapabilities }: Props) {
  const caps = new Set(userCapabilities)
  const canEditConsorcio = caps.has('consorcio.edit')
  const canEditLegal = caps.has('consorcio.legal.edit')
  const canManageUnits = caps.has('units.manage')
  const canManageHolders = caps.has('holders.manage')

  const cards = [
    { label: 'Unidades', value: totals.units, icon: Home },
    { label: 'Titulares activos', value: totals.activeHolders, icon: Users },
    { label: 'Gastos del mes', value: totals.monthExpenses, icon: FileText },
  ]

  return (
    <div className="space-y-6">
      <section className="glass-card rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 capitalize text-muted-foreground">
              <Building2 className="w-3 h-3" />
              {property.propertyKind.replace('_', ' ')}
            </span>
            {property.taxId ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                CUIT: {property.taxId}
              </span>
            ) : null}
            {property.managementFeePct !== null ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                Fee: {property.managementFeePct}%
              </span>
            ) : null}
            {property.managedSince ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                Desde: {property.managedSince}
              </span>
            ) : null}
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-muted-foreground">Imputado en el mes</div>
            <div className="font-serif text-xl font-bold text-foreground tabular-nums">
              <Money amount={totals.monthAmount} minimumFractionDigits={0} maximumFractionDigits={0} />
            </div>
          </div>
        </div>
        {property.notes ? (
          <p className="text-sm text-muted-foreground mt-3 whitespace-pre-line">{property.notes}</p>
        ) : null}
      </section>

      <ConsorcioSettingsForm property={property} canEdit={canEditConsorcio} />
      <ConsorcioLegalForm propertyId={property.id} initial={property.legalInfo} canEdit={canEditLegal} />

      <section className="glass-card rounded-2xl p-5">
        <header className="mb-4">
          <h2 className="font-serif text-lg font-semibold text-foreground">Informacion general del country</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Horarios, reglas de convivencia, amenities y contactos visibles para residentes y propietarios.
          </p>
        </header>
        <BuildingInformationManager
          propertyId={property.id}
          items={buildingInformation}
          canEdit={canEditConsorcio}
        />
      </section>

      <AccountingPeriodCard
        propertyId={property.id}
        period={currentPeriod}
        userCapabilities={userCapabilities}
      />

      <section className="grid grid-cols-3 gap-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="glass-card rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground tabular-nums">{card.value}</div>
                <div className="text-xs text-muted-foreground">{card.label}</div>
              </div>
            </div>
          )
        })}
      </section>

      <section className="glass-card rounded-2xl p-5">
        <header className="mb-4">
          <h2 className="font-serif text-lg font-semibold text-foreground">Unidades y titulares</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click en una unidad para expandir, editarla o gestionar sus titulares.
          </p>
        </header>
        <UnitsManager
          propertyId={property.id}
          units={units}
          canManageUnits={canManageUnits}
          canManageHolders={canManageHolders}
        />
      </section>

      <section className="glass-card rounded-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold text-foreground">Gastos recientes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Ultimos 10 movimientos cargados en este consorcio.</p>
          </div>
          <Link href="/iadmin/gastos" className="text-xs font-medium text-primary hover:underline">
            Ver toda la bandeja
          </Link>
        </header>

        {recentExpenses.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Sin gastos cargados en este consorcio.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
                <th className="text-left px-5 py-3 font-medium">Descripcion</th>
                <th className="text-left px-5 py-3 font-medium">Proveedor</th>
                <th className="text-left px-5 py-3 font-medium">Estado</th>
                <th className="text-right px-5 py-3 font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {recentExpenses.map((expense) => (
                <tr key={expense.id} className="border-b border-border/30 last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-3">
                    <Link href={`/iadmin/gastos/${expense.id}`} className="font-medium text-foreground hover:text-primary">
                      {expense.description}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {expense.issuedAt ?? expense.createdAt.slice(0, 10)}
                      {expense.pendingExtraction ? ' · doc por validar' : ''}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{expense.providerName ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${EXPENSE_STATUS_TONE[expense.status]}`}>
                      {EXPENSE_STATUS_LABELS[expense.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-foreground">
                    <Money amount={expense.amount} currency={expense.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
