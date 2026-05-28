import Link from 'next/link'
import { ArrowRight, Building2 } from 'lucide-react'
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
  const properties = portfolio?.properties ?? []
  const allowedIds = properties.map((p) => p.id)
  const currentPropertyId = await getCurrentPropertyId(allowedIds)
  const scopedProperty = currentPropertyId
    ? properties.find((p) => p.id === currentPropertyId) ?? null
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

  // Sin country activo y varios para elegir → lista de cards para pick uno.
  if (!scopedProperty) {
    return (
      <div className="space-y-4">
        <header className="glass-card rounded-2xl p-6">
          <p className="text-xs uppercase tracking-wider text-primary font-medium">Cobranzas</p>
          <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Control de pagos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Elegí un country (abajo o con el selector del header) para ver y registrar pagos de sus unidades.
          </p>
        </header>

        {properties.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
            Todavía no tenés countries cargados.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {properties.map((p) => (
              <Link
                key={p.id}
                href={`/iadmin/consorcios/${p.id}`}
                className="glass-card rounded-2xl p-5 hover:ring-2 hover:ring-primary/30 transition-all group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate group-hover:text-primary">
                        {p.displayName ?? p.buildingName}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.totalUnits} unidades
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Cobranzas</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">
          Cobranzas · {scopedProperty.displayName ?? scopedProperty.buildingName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Estado de cobranza del último mes emitido. Quién pagó, quién pagó tarde, quién está en deuda.
        </p>
      </header>
      <PropertyFilterBanner propertyName={scopedProperty.displayName ?? scopedProperty.buildingName} />

      {runDetail ? (
        <CobranzaMesView run={runDetail} />
      ) : (
        <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground text-center">
          Este country todavía no tiene una liquidación emitida. Andá a la Mesa del mes → "Liquidar y enviar" para emitir la del mes.
        </div>
      )}
    </div>
  )
}
