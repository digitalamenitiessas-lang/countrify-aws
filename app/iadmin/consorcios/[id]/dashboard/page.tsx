import { notFound } from 'next/navigation'
import { Building2, FileSpreadsheet, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import {
  CollectionTrendChart,
  OverdueChart,
  ProvidersPayableWidget,
} from '@/components/admin-backoffice/consorcio/dashboard-charts'
import {
  DashboardQuickStats,
  PeriodCollectionsWidget,
} from '@/components/admin-backoffice/consorcio/dashboard-widgets'
import { ProjectionCard } from '@/components/admin-backoffice/consorcio/projection-card'
import { can, requireIAdmin } from '@/lib/auth'
import { getIAdminConsorcioDashboard } from '@/lib/data'

export default async function ConsorcioInicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { context } = await requireIAdmin({ capability: 'consorcio.view' })

  const dashboard = await getIAdminConsorcioDashboard(id)
  if (!dashboard) {
    notFound()
  }

  const canViewReports = can(context, 'reports.view', { administrationId: dashboard.property.administrationId })

  return (
    <div className="space-y-6">
      <DashboardQuickStats
        activeUnits={dashboard.activeUnitsCount}
        pendingExpenses={dashboard.pendingExpenses}
        pendingDocuments={dashboard.pendingDocuments}
        collectionRatePct={dashboard.periodCollections.collectionRatePct}
      />

      <CollectionTrendChart points={dashboard.monthlyTrend} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <PeriodCollectionsWidget data={dashboard.periodCollections} />
        <OverdueChart
          buckets={dashboard.overdueBuckets}
          totalAmount={dashboard.totalOverdueAmount}
          totalUnits={dashboard.totalOverdueUnits}
        />
      </div>

      <ProvidersPayableWidget
        propertyId={id}
        groups={dashboard.accountsPayable}
        total={dashboard.totalPayable}
      />

      {canViewReports ? <ProjectionCard propertyId={id} /> : null}

      {/* Accesos rapidos segun el estado del consorcio */}
      <section className="glass-card rounded-2xl p-5">
        <h3 className="font-serif text-lg font-semibold text-foreground mb-3">Accesos rapidos</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <QuickLink
            href={`/iadmin/consorcios/${id}/gestion`}
            icon={Building2}
            title="Gestion del consorcio"
            description="Datos, unidades, titulares, periodo contable"
          />
          <QuickLink
            href={`/iadmin/gastos`}
            icon={ShieldAlert}
            title="Procesar gastos"
            description={`${dashboard.pendingExpenses} pendientes de revision`}
          />
          <QuickLink
            href={`/iadmin/liquidaciones`}
            icon={FileSpreadsheet}
            title="Liquidaciones"
            description={
              dashboard.periodCollections.runId
                ? 'Liquidacion del mes ya generada'
                : 'Generar liquidacion del periodo'
            }
          />
        </div>
      </section>
    </div>
  )
}

function QuickLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: typeof Building2
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border/40 p-4 hover:border-primary/40 hover:bg-muted/40 transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
        <Icon className="w-4 h-4" />
      </div>
      <div className="font-medium text-foreground group-hover:text-primary">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
    </Link>
  )
}
