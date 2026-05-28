import { LiquidationsTable } from '@/components/admin-backoffice/liquidaciones/liquidations-table'
import { PropertyFilterBanner } from '@/components/admin-backoffice/shell/property-filter-banner'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminLiquidationRuns, getIAdminPortfolio } from '@/lib/data'
import { getCurrentPropertyId } from '@/lib/iadmin/current-property'

export default async function LiquidacionesPage() {
  const { context } = await requireIAdmin({ capability: 'liquidations.view' })

  const administrationId = context.primary?.administration.id
  if (!administrationId) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        Tu cuenta no tiene una administracion asignada todavia.
      </div>
    )
  }

  const [runsAll, portfolio] = await Promise.all([
    getIAdminLiquidationRuns(administrationId),
    getIAdminPortfolio(administrationId),
  ])

  const allowedIds = (portfolio?.properties ?? []).map((p) => p.id)
  const currentPropertyId = await getCurrentPropertyId(allowedIds)
  const runs = currentPropertyId
    ? runsAll.filter((r) => r.managedPropertyId === currentPropertyId)
    : runsAll
  const activeProperty = currentPropertyId
    ? portfolio?.properties.find((p) => p.id === currentPropertyId) ?? null
    : null

  return (
    <div className="space-y-6">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Liquidaciones</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Corridas mensuales</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cada corrida se genera por consorcio y período. Flujo:{' '}
          <span className="font-medium text-foreground">Borrador</span> →{' '}
          <span className="font-medium text-foreground">Calculada</span> →{' '}
          <span className="font-medium text-foreground">Emitida</span> →{' '}
          <span className="font-medium text-foreground">Cerrada</span>. Una vez cerrada queda bloqueada.
        </p>
      </header>

      {activeProperty ? (
        <PropertyFilterBanner
          propertyName={activeProperty.displayName ?? activeProperty.buildingName}
          count={runs.length}
          itemLabel="corridas"
        />
      ) : null}

      <LiquidationsTable runs={runs} />
    </div>
  )
}
