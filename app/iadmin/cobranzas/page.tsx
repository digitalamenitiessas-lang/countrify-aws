import { CobranzaMesView } from '@/components/admin-backoffice/cobranzas/cobranza-mes-view'
import { PropertyFilterBanner } from '@/components/admin-backoffice/shell/property-filter-banner'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminLiquidationRunDetail, getIAdminPortfolio } from '@/lib/data'
import { getCurrentPropertyId } from '@/lib/iadmin/current-property'
import { pgQuery } from '@/lib/db/postgres'

export default async function CobranzasPage() {
  const { context } = await requireIAdmin({ capability: 'collections.view' })

  const administrationId = context.primary?.administration.id
  const portfolio = administrationId ? await getIAdminPortfolio(administrationId) : null
  const allowedIds = (portfolio?.properties ?? []).map((p) => p.id)
  const currentPropertyId = await getCurrentPropertyId(allowedIds)
  const scopedProperty = currentPropertyId
    ? portfolio?.properties.find((p) => p.id === currentPropertyId) ?? null
    : null

  let runDetail: Awaited<ReturnType<typeof getIAdminLiquidationRunDetail>> = null
  if (scopedProperty) {
    const latestRun = await pgQuery<{ id: string }>(
      `select id from countrify.iadmin_liquidation_runs
        where managed_property_id = $1 and status in ('issued', 'closed')
        order by generated_at desc
        limit 1`,
      [scopedProperty.id],
    )
    const runId = latestRun.rows[0]?.id
    if (runId) {
      runDetail = await getIAdminLiquidationRunDetail(runId)
    }
  }

  return (
    <div className="space-y-4">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Cobranzas</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">
          {scopedProperty ? `Cobranzas · ${scopedProperty.displayName ?? scopedProperty.buildingName}` : 'Cobranzas y deuda'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {scopedProperty
            ? 'Estado de cobranza del último mes emitido. Quién pagó, quién pagó tarde, quién está en deuda.'
            : 'Conciliacion de pagos contra liquidaciones emitidas.'}
        </p>
      </header>
      {scopedProperty ? (
        <PropertyFilterBanner propertyName={scopedProperty.displayName ?? scopedProperty.buildingName} />
      ) : null}

      {scopedProperty ? (
        runDetail ? (
          <CobranzaMesView run={runDetail} />
        ) : (
          <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground text-center">
            Este edificio todavía no tiene una liquidación emitida. Andá a Resumen → "Liquidar y enviar" para emitir la del mes.
          </div>
        )
      ) : (
        <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
          Vista cross-cartera de cobranzas en desarrollo. Por ahora, entrá a un edificio para ver su estado de cobranza del mes.
        </div>
      )}
    </div>
  )
}
