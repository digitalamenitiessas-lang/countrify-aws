import Link from 'next/link'
import { AlertTriangle, ArrowRight, Banknote, Building2, CheckCircle2, Home, Receipt, ShieldAlert, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Money } from '@/components/admin-backoffice/shared/money'
import type { IAdminPortfolio, IAdminPortfolioOverview, IAdminPortfolioPropertyRow } from '@/lib/types'

type Props = {
  portfolio: IAdminPortfolio
  overview: IAdminPortfolioOverview | null
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

      {/* KPIs consolidados */}
      {totals ? (
        <section className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          <BigStat
            icon={Wallet}
            label="Saldo total en cuentas"
            value={<Money amount={totals.totalBalance} minimumFractionDigits={0} maximumFractionDigits={0} />}
            tone={totals.totalBalance < 0 ? 'danger' : undefined}
          />
          <BigStat
            icon={AlertTriangle}
            label="Deuda de residentes"
            value={<Money amount={totals.totalOverdue} minimumFractionDigits={0} maximumFractionDigits={0} />}
            tone={totals.totalOverdue > 0 ? 'warning' : undefined}
          />
          <BigStat
            icon={Receipt}
            label="Pendiente a proveedores"
            value={<Money amount={totals.totalPayable} minimumFractionDigits={0} maximumFractionDigits={0} />}
          />
          <BigStat
            icon={TrendingUp}
            label="Liquidado este mes"
            value={<Money amount={totals.totalLiquidatedMonth} minimumFractionDigits={0} maximumFractionDigits={0} />}
          />
          <BigStat
            icon={ShieldAlert}
            label="Gastos por revisar"
            value={totals.pendingExpenses.toString()}
            tone={totals.pendingExpenses > 0 ? 'warning' : undefined}
          />
        </section>
      ) : null}

      {/* Tabla operativa */}
      <section className="glass-card rounded-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-border/40">
          <h2 className="font-serif text-lg font-semibold text-foreground">
            Consorcios bajo administración
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click en el nombre para abrir el detalle.
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Aun no hay consorcios cargados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium">Consorcio</th>
                  <th className="text-right px-4 py-3 font-medium">Saldo</th>
                  <th className="text-right px-4 py-3 font-medium">A proveedor</th>
                  <th className="text-right px-4 py-3 font-medium">Deuda residentes</th>
                  <th className="text-right px-4 py-3 font-medium">Liquidado mes</th>
                  <th className="text-right px-4 py-3 font-medium">Cobrado</th>
                  <th className="text-center px-4 py-3 font-medium">Tasa</th>
                  <th className="text-left px-4 py-3 font-medium">Alertas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <PropertyRow key={row.property.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function PropertyRow({ row }: { row: IAdminPortfolioPropertyRow }) {
  const { property } = row
  const rate = row.collectionRatePct
  const rateTone =
    rate === null ? 'text-muted-foreground' : rate >= 80 ? 'text-emerald-700' : rate >= 50 ? 'text-amber-700' : 'text-rose-700'

  return (
    <tr className="border-b border-border/30 last:border-0 hover:bg-muted/40">
      <td className="px-4 py-3">
        <Link
          href={`/iadmin/consorcios/${property.id}`}
          className="font-medium text-foreground hover:text-primary inline-flex items-center gap-1"
        >
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
          {property.displayName ?? property.buildingName}
          <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100" />
        </Link>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1">
            <Home className="w-3 h-3" />
            {property.totalUnits} un.
          </span>
          {property.propertyKind ? (
            <span className="capitalize">{property.propertyKind.replace('_', ' ')}</span>
          ) : null}
        </div>
      </td>
      <td className={`px-4 py-3 text-right tabular-nums ${row.totalBalance < 0 ? 'text-rose-700' : 'text-foreground'}`}>
        <Money amount={row.totalBalance} />
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
        {row.accountsPayableTotal > 0 ? <Money amount={row.accountsPayableTotal} /> : '—'}
      </td>
      <td className={`px-4 py-3 text-right tabular-nums ${row.overdueAmount > 0 ? 'text-rose-700 font-medium' : 'text-muted-foreground'}`}>
        {row.overdueAmount > 0 ? <Money amount={row.overdueAmount} /> : '✓'}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-foreground">
        {row.currentMonthLiquidated > 0 ? <Money amount={row.currentMonthLiquidated} /> : '—'}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
        {row.currentMonthCollected > 0 ? <Money amount={row.currentMonthCollected} /> : '—'}
      </td>
      <td className="px-4 py-3 text-center">
        {rate !== null ? (
          <span className={`inline-flex items-center gap-1 font-medium tabular-nums ${rateTone}`}>
            {rate >= 80 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {rate}%
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {row.alerts.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle2 className="w-3 h-3" />
            Sin alertas
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
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
      </td>
    </tr>
  )
}

function BigStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Building2
  label: string
  value: React.ReactNode
  tone?: 'warning' | 'danger'
}) {
  const toneClass = tone === 'danger' ? 'text-rose-700' : tone === 'warning' ? 'text-amber-700' : 'text-foreground'
  return (
    <div className="glass-card rounded-2xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-0.5 font-serif text-lg xl:text-xl font-bold tabular-nums leading-none ${toneClass}`}>{value}</div>
      </div>
    </div>
  )
}

// Legacy sin overview (por compat)
void Banknote
