import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Home,
  Receipt,
  ScrollText,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Money } from '@/components/admin-backoffice/shared/money'
import type { IAdminPortfolio, IAdminPortfolioOverview, IAdminPortfolioPropertyRow } from '@/lib/types'

type Props = {
  portfolio: IAdminPortfolio
  overview: IAdminPortfolioOverview | null
}

/** Verde / amarillo / rojo según alertas y nivel de cobranza. */
function trafficLight(row: IAdminPortfolioPropertyRow): 'green' | 'amber' | 'red' {
  if (row.totalBalance < 0) return 'red'
  if (row.collectionRatePct !== null && row.collectionRatePct < 40) return 'red'
  if (row.alerts.length >= 2) return 'red'
  if (row.alerts.length >= 1) return 'amber'
  if (row.collectionRatePct !== null && row.collectionRatePct < 70) return 'amber'
  return 'green'
}

const LIGHT_STYLES: Record<'green' | 'amber' | 'red', { dot: string; ring: string; label: string }> = {
  green: { dot: 'bg-emerald-500', ring: 'ring-emerald-200', label: 'Al día' },
  amber: { dot: 'bg-amber-500', ring: 'ring-amber-200', label: 'Atención' },
  red: { dot: 'bg-rose-500', ring: 'ring-rose-200', label: 'Crítico' },
}

export function PortfolioOverview({ portfolio, overview }: Props) {
  const rows = overview?.rows ?? []
  const totals = overview?.totals

  return (
    <div className="space-y-6">
      <section className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Cartera</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">
          {portfolio.administration.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Vista operativa de toda la cartera. Identificá qué consorcio necesita atención hoy.
        </p>
      </section>

      {/* KPIs consolidados con deep-link a filtros */}
      {totals ? (
        <section className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          <BigStat
            icon={Wallet}
            label="Saldo total en cuentas"
            value={<Money amount={totals.totalBalance} minimumFractionDigits={0} maximumFractionDigits={0} />}
            tone={totals.totalBalance < 0 ? 'danger' : undefined}
            href="/iadmin/cobranzas"
          />
          <BigStat
            icon={AlertTriangle}
            label="Deuda de vecinos"
            value={<Money amount={totals.totalOverdue} minimumFractionDigits={0} maximumFractionDigits={0} />}
            tone={totals.totalOverdue > 0 ? 'warning' : undefined}
            href="/iadmin/cobranzas/reportes"
          />
          <BigStat
            icon={Receipt}
            label="Pendiente a proveedores"
            value={<Money amount={totals.totalPayable} minimumFractionDigits={0} maximumFractionDigits={0} />}
            href="/iadmin/gastos?status=approved"
          />
          <BigStat
            icon={TrendingUp}
            label="Liquidado este mes"
            value={<Money amount={totals.totalLiquidatedMonth} minimumFractionDigits={0} maximumFractionDigits={0} />}
            href="/iadmin/liquidaciones"
          />
          <BigStat
            icon={ShieldAlert}
            label="Gastos por revisar"
            value={totals.pendingExpenses.toString()}
            tone={totals.pendingExpenses > 0 ? 'warning' : undefined}
            href="/iadmin/gastos?status=pending_review"
          />
        </section>
      ) : null}

      {/* Grid de cards por consorcio */}
      <section>
        <header className="mb-3 px-1">
          <h2 className="font-serif text-lg font-semibold text-foreground">
            Consorcios bajo administración
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click en cualquier parte de la card para abrir el detalle.
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="glass-card rounded-2xl px-5 py-12 text-center text-sm text-muted-foreground">
            Aún no hay consorcios cargados.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {rows.map((row) => (
              <PropertyCard key={row.property.id} row={row} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PropertyCard({ row }: { row: IAdminPortfolioPropertyRow }) {
  const { property } = row
  const rate = row.collectionRatePct
  const rateTone =
    rate === null
      ? 'text-muted-foreground'
      : rate >= 80
        ? 'text-emerald-700'
        : rate >= 50
          ? 'text-amber-700'
          : 'text-rose-700'
  const light = trafficLight(row)
  const lightMeta = LIGHT_STYLES[light]

  return (
    <article className="glass-card rounded-2xl overflow-hidden hover:ring-2 hover:ring-primary/30 transition-all group flex flex-col">
      {/* La fila/card entera linkea al detalle (excepto botones) */}
      <Link
        href={`/iadmin/consorcios/${property.id}`}
        className="flex-1 px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ring-4 ${lightMeta.dot} ${lightMeta.ring}`}
                title={lightMeta.label}
              />
              <h3 className="font-medium text-foreground group-hover:text-primary truncate">
                {property.displayName ?? property.buildingName}
              </h3>
            </div>
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1">
                <Home className="w-3 h-3" />
                {property.totalUnits} un.
              </span>
              {property.propertyKind ? (
                <span className="capitalize">{property.propertyKind.replace('_', ' ')}</span>
              ) : null}
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
        </div>

        {/* Métricas compactas */}
        <dl className="grid grid-cols-2 gap-2 mt-4 text-sm">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo</dt>
            <dd
              className={`tabular-nums font-medium ${row.totalBalance < 0 ? 'text-rose-700' : 'text-foreground'}`}
            >
              <Money amount={row.totalBalance} minimumFractionDigits={0} maximumFractionDigits={0} />
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Deuda vecinos</dt>
            <dd
              className={`tabular-nums font-medium ${row.overdueAmount > 0 ? 'text-rose-700' : 'text-muted-foreground'}`}
            >
              {row.overdueAmount > 0 ? (
                <Money amount={row.overdueAmount} minimumFractionDigits={0} maximumFractionDigits={0} />
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Liquidado mes</dt>
            <dd className="tabular-nums text-foreground">
              {row.currentMonthLiquidated > 0 ? (
                <Money amount={row.currentMonthLiquidated} minimumFractionDigits={0} maximumFractionDigits={0} />
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Tasa cobranza</dt>
            <dd className={`tabular-nums font-medium ${rateTone}`}>
              {rate !== null ? (
                <span className="inline-flex items-center gap-1">
                  {rate >= 80 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {rate}%
                </span>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>

        {/* Alertas */}
        {row.alerts.length === 0 ? (
          <div className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle2 className="w-3 h-3" />
            Sin alertas
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1">
            {row.alerts.slice(0, 3).map((a, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-[10px] font-medium"
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                {a}
              </span>
            ))}
          </div>
        )}
      </Link>

      {/* Acciones rápidas inline (no entran al detalle) */}
      <div className="border-t border-border/40 px-3 py-2 flex items-center gap-1 flex-wrap bg-muted/10">
        <QuickAction
          href={`/iadmin/consorcios/${property.id}`}
          label="Mesa"
          icon={Building2}
        />
        <QuickAction href="/iadmin/gastos" label="Gastos" icon={Receipt} />
        <QuickAction href="/iadmin/liquidaciones" label="Liquidar" icon={ScrollText} />
        <QuickAction href="/iadmin/cobranzas" label="Cobrar" icon={Wallet} />
      </div>
    </article>
  )
}

function QuickAction({
  href,
  label,
  icon: Icon,
}: {
  href: string
  label: string
  icon: typeof Receipt
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
    >
      <Icon className="w-3 h-3" />
      {label}
    </Link>
  )
}

function BigStat({
  icon: Icon,
  label,
  value,
  tone,
  href,
}: {
  icon: typeof Building2
  label: string
  value: React.ReactNode
  tone?: 'warning' | 'danger'
  href?: string
}) {
  const toneClass = tone === 'danger' ? 'text-rose-700' : tone === 'warning' ? 'text-amber-700' : 'text-foreground'
  const Wrapper = href ? Link : 'div'
  const wrapperProps = href ? { href } : {}
  return (
    <Wrapper
      {...(wrapperProps as { href: string })}
      className={`glass-card rounded-2xl p-4 flex items-center gap-3 ${href ? 'hover:ring-1 hover:ring-primary/30 transition-all cursor-pointer' : ''}`}
    >
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-0.5 font-serif text-lg xl:text-xl font-bold tabular-nums leading-none ${toneClass}`}>{value}</div>
      </div>
    </Wrapper>
  )
}
