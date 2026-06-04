import Link from 'next/link'
import { Download } from 'lucide-react'
import { requireIAdmin } from '@/lib/auth'
import { computeCollectionsKpisFromPostgres, listMorososByAdminFromPostgres } from '@/lib/db/iadmin-reads'
import { materializeLateFeesForAdministrationInPostgres } from '@/lib/db/iadmin-writes'
import { MorososTable } from '@/components/admin-backoffice/cobranzas/morosos-table'
import { Money } from '@/components/admin-backoffice/shared/money'

export default async function CobranzasReportesPage() {
  const { context } = await requireIAdmin({ capability: 'reports.view' })
  const administrationId = context.primary?.administration.id

  if (!administrationId) {
    return (
      <div className="space-y-4">
        <header className="glass-card rounded-2xl p-6">
          <p className="text-xs uppercase tracking-wider text-primary font-medium">Reportes</p>
          <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Reportes de cobranzas</h1>
        </header>
        <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
          Tu cuenta no tiene una administración asignada.
        </div>
      </div>
    )
  }

  await materializeLateFeesForAdministrationInPostgres({
    administrationId,
    asOfDate: new Date().toISOString().slice(0, 10),
    actorProfileId: null,
  })

  const [morosos, kpis] = await Promise.all([
    listMorososByAdminFromPostgres({ administrationId }),
    computeCollectionsKpisFromPostgres({ administrationId }),
  ])

  // Total a cobrar (todos los buckets sumados — coincide con
  // open_balance_total de los KPIs pero lo recalculamos por consistencia
  // visual con la tabla).
  const totalMoroso = morosos.reduce((acc, r) => acc + Number(r.total_balance), 0)
  const unitsCount = morosos.length
  const overdue30plus = morosos.reduce(
    (acc, r) =>
      acc + Number(r.bucket_31_60) + Number(r.bucket_61_90) + Number(r.bucket_over_90),
    0,
  )

  return (
    <div className="space-y-4">
      <header className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-primary font-medium">Reportes</p>
            <h1 className="font-serif text-2xl font-bold text-foreground mt-1">
              Reportes de cobranzas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Saldo abierto por unidad, aging por buckets y exportación CSV para Excel.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/iadmin/cobranzas"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              ← Volver a cobranzas
            </Link>
            <a
              href="/iadmin/cobranzas/reportes/export-morosos"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90"
            >
              <Download className="w-3.5 h-3.5" />
              Morosos CSV
            </a>
            <a
              href="/iadmin/cobranzas/reportes/export-pagos"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Download className="w-3.5 h-3.5" />
              Pagos CSV
            </a>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">Unidades con deuda</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{unitsCount}</div>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">Total a cobrar</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            <Money amount={totalMoroso} />
          </div>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">Mora &gt; 30 días</div>
          <div className="mt-1 text-2xl font-semibold text-rose-600">
            <Money amount={overdue30plus} />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            de {Number(kpis.open_balance_total).toLocaleString('es-AR')} total abierto
          </div>
        </div>
      </div>

      <MorososTable rows={morosos} />
    </div>
  )
}
