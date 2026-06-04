import Link from 'next/link'
import { ArrowRight, Building2, Inbox } from 'lucide-react'
import { CollectionsByUnitView } from '@/components/admin-backoffice/cobranzas/collections-by-unit-view'
import { can, requireIAdmin } from '@/lib/auth'
import {
  getIAdminCashAccounts,
  getIAdminMesaState,
  getIAdminPortfolio,
} from '@/lib/data'
import { listAllAccountingPeriodsFromPostgres } from '@/lib/db/iadmin-reads'
import { pgQuery } from '@/lib/db/postgres'
import { getCurrentPropertyId } from '@/lib/iadmin/current-property'

function parsePeriodParam(raw: string | undefined | null): { year: number; month: number } | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})$/.exec(raw)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (year < 2020 || year > 2100 || month < 1 || month > 12) return null
  return { year, month }
}

export const dynamic = 'force-dynamic'

export default async function CobranzasPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const params = await searchParams
  const { context } = await requireIAdmin({ capability: 'collections.view' })

  const administrationId = context.primary?.administration.id
  if (!administrationId) {
    return (
      <div className="space-y-4">
        <header className="glass-card rounded-2xl p-6">
          <p className="text-xs uppercase tracking-wider text-primary font-medium">Cobranzas</p>
          <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Control de pagos</h1>
        </header>
        <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
          Tu cuenta no tiene una administración asignada todavía.
        </div>
      </div>
    )
  }

  const portfolio = await getIAdminPortfolio(administrationId)
  const properties = portfolio?.properties ?? []
  const allowedIds = properties.map((p) => p.id)
  const currentPropertyId = await getCurrentPropertyId(allowedIds)

  // Sin edificio activo y varios para elegir → mostrar lista para que pick uno.
  if (!currentPropertyId) {
    return (
      <div className="space-y-4">
        <header className="glass-card rounded-2xl p-6">
          <p className="text-xs uppercase tracking-wider text-primary font-medium">Cobranzas</p>
          <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Control de pagos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Elegí un edificio arriba (selector en el header) para ver y registrar pagos de sus
            unidades.
          </p>
        </header>

        {properties.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
            Todavía no tenés consorcios cargados.{' '}
            <Link href="/iadmin/cartera" className="text-primary hover:underline">
              Ir a Cartera
            </Link>
            .
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

  // Hay edificio activo → cargar mesa state del período actual + cash accounts.
  const property = properties.find((p) => p.id === currentPropertyId)
  if (!property) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        No se pudo cargar el edificio seleccionado.
      </div>
    )
  }

  const now = new Date()
  const parsedPeriod = parsePeriodParam(params.period)
  const year = parsedPeriod?.year ?? now.getFullYear()
  const month = parsedPeriod?.month ?? now.getMonth() + 1

  const [state, cashAccounts, pendingClaimsCount, availablePeriods] = await Promise.all([
    getIAdminMesaState(currentPropertyId, year, month),
    getIAdminCashAccounts(currentPropertyId),
    pgQuery<{ count: string }>(
      `select count(*)::text as count
         from public.iadmin_payment_claims
        where managed_property_id = $1 and status = 'pending'`,
      [currentPropertyId],
    ).then((r) => Number(r.rows[0]?.count ?? 0)),
    listAllAccountingPeriodsFromPostgres(currentPropertyId),
  ])

  if (!state) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        No se pudo cargar el estado de cobranzas del período actual.
      </div>
    )
  }

  const canRegisterPayments = can(context, 'collections.register', { administrationId })

  return (
    <div className="space-y-4">
      <header className="glass-card rounded-2xl p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-primary font-medium">Cobranzas</p>
            <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Control de pagos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Registrá pagos rápido por unidad. Para cobros parciales, anular pagos o ver historial
              completo, abrí el detalle de cada unidad.
            </p>
          </div>
          <Link
            href="/iadmin/cobranzas/validar"
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              pendingClaimsCount > 0
                ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                : 'border-input bg-background hover:bg-muted'
            }`}
          >
            <Inbox className="w-4 h-4" />
            Validar comprobantes
            {pendingClaimsCount > 0 ? (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                {pendingClaimsCount}
              </span>
            ) : null}
          </Link>
        </div>
      </header>

      <CollectionsByUnitView
        state={state}
        cashAccounts={cashAccounts}
        canRegisterPayments={canRegisterPayments}
        propertyId={currentPropertyId}
        propertyName={property.displayName ?? property.buildingName}
        year={year}
        month={month}
        availablePeriods={availablePeriods.map((p) => ({
          year: p.period_year,
          month: p.period_month,
        }))}
      />
    </div>
  )
}
