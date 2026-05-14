import Link from 'next/link'
import { AlertTriangle, ArrowRight, Banknote, Clock, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Money } from '@/components/admin-backoffice/shared/money'
import type {
  IAdminAccountPayable,
  IAdminDashboardCashSnapshot,
  IAdminOverdueBucket,
  IAdminPeriodCollections,
} from '@/lib/types'

// ----------------------------------------------------------------------------
// Widget wrapper
// ----------------------------------------------------------------------------

function Widget({
  title,
  subtitle,
  action,
  children,
  variant = 'default',
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  variant?: 'default' | 'dark'
}) {
  return (
    <section
      className={`glass-card rounded-2xl overflow-hidden ${variant === 'dark' ? 'bg-slate-900 text-slate-100' : ''}`}
    >
      <header
        className={`px-5 py-4 flex items-start justify-between gap-3 border-b ${
          variant === 'dark' ? 'border-slate-800' : 'border-border/40'
        }`}
      >
        <div className="min-w-0">
          <h3 className={`font-serif text-lg font-semibold ${variant === 'dark' ? 'text-slate-100' : 'text-foreground'}`}>
            {title}
          </h3>
          {subtitle ? (
            <p className={`text-xs mt-0.5 ${variant === 'dark' ? 'text-slate-400' : 'text-muted-foreground'}`}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {action}
      </header>
      <div className={variant === 'dark' ? 'text-slate-100' : ''}>{children}</div>
    </section>
  )
}

function PlaceholderBanner({ text }: { text: string }) {
  return (
    <div className="mx-5 my-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
      {text}
    </div>
  )
}

// ----------------------------------------------------------------------------
// 1. Balances widget
// ----------------------------------------------------------------------------

export function BalancesWidget({
  balances,
  totalBalance,
}: {
  balances: IAdminDashboardCashSnapshot[]
  totalBalance: number
}) {
  return (
    <Widget
      title="Saldos"
      subtitle="Dinero disponible del consorcio por cuenta"
      variant="dark"
      action={
        <div className="flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs">
          <Wallet className="w-3 h-3" />
          {balances.length} cuenta{balances.length === 1 ? '' : 's'}
        </div>
      }
    >
      {balances.some((b) => b.placeholder) ? (
        <div className="mx-5 my-3 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-400">
          Saldos aproximados desde gastos imputados. Agregá cuentas bancarias para el saldo real.
        </div>
      ) : null}
      <ul className="divide-y divide-slate-800">
        {balances.map((b) => (
          <li key={b.label} className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-slate-300">{b.label}</span>
            <span className={`font-medium tabular-nums ${b.amount < 0 ? 'text-rose-300' : 'text-slate-100'}`}>
              <Money amount={b.amount} minimumFractionDigits={0} maximumFractionDigits={0} />
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between px-5 py-3 text-sm bg-slate-950/40">
          <span className="font-semibold">Total</span>
          <span className={`font-serif text-xl font-bold tabular-nums ${totalBalance < 0 ? 'text-rose-300' : 'text-slate-100'}`}>
            <Money amount={totalBalance} minimumFractionDigits={0} maximumFractionDigits={0} />
          </span>
        </li>
      </ul>
    </Widget>
  )
}

// ----------------------------------------------------------------------------
// 2. Accounts payable widget (pendiente de pago a proveedores)
// ----------------------------------------------------------------------------

export function AccountsPayableWidget({
  items,
  totalPayable,
}: {
  items: IAdminAccountPayable[]
  totalPayable: number
}) {
  return (
    <Widget
      title="Pendiente de pago"
      subtitle="Gastos aprobados, aun no imputados al periodo"
      variant="dark"
      action={
        <div className="flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs">
          <Receipt className="w-3 h-3" />
          {items.length} proveedor{items.length === 1 ? '' : 'es'}
        </div>
      }
    >
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          Sin pagos pendientes a proveedores.
        </div>
      ) : (
        <ul className="divide-y divide-slate-800">
          {items.slice(0, 6).map((p) => (
            <li key={p.providerId ?? p.providerName} className="flex items-center justify-between px-5 py-3 text-sm">
              <div className="min-w-0">
                <div className="text-slate-100 truncate">{p.providerName}</div>
                <div className="text-[10px] text-slate-400">
                  {p.expensesCount} gasto{p.expensesCount === 1 ? '' : 's'}
                  {p.oldestDate ? ` · desde ${p.oldestDate}` : ''}
                </div>
              </div>
              <span className="font-medium tabular-nums text-slate-100 shrink-0">
                <Money amount={p.amount} minimumFractionDigits={0} maximumFractionDigits={0} />
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between px-5 py-3 text-sm bg-slate-950/40">
            <span className="font-semibold">Total</span>
            <span className="font-serif text-xl font-bold tabular-nums">
              <Money amount={totalPayable} minimumFractionDigits={0} maximumFractionDigits={0} />
            </span>
          </li>
        </ul>
      )}
    </Widget>
  )
}

// ----------------------------------------------------------------------------
// 3. Period collections widget
// ----------------------------------------------------------------------------

export function PeriodCollectionsWidget({ data }: { data: IAdminPeriodCollections }) {
  const ratio = data.collectionRatePct
  const ratioTone =
    ratio === null ? 'text-muted-foreground' : ratio >= 80 ? 'text-emerald-600' : ratio >= 50 ? 'text-amber-600' : 'text-rose-600'

  return (
    <Widget
      title="Cobranzas del periodo actual"
      subtitle={data.periodLabel ? `Periodo ${data.periodLabel}` : 'Sin liquidacion del mes en curso'}
      action={
        data.runId ? (
          <Link
            href={`/iadmin/liquidaciones/${data.runId}`}
            className="rounded-full border border-primary/30 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 flex items-center gap-1"
          >
            Ver <ArrowRight className="w-3 h-3" />
          </Link>
        ) : null
      }
    >
      {data.placeholder ? <PlaceholderBanner text="Cobranzas en periodo de carga inicial." /> : null}
      <div className="p-5 space-y-3">
        <KpiRow label="Liquidado expensas" value={data.liquidatedOrdinary} />
        <KpiRow label="Liquidado extraordinarias" value={data.liquidatedExtraordinary} muted />
        <KpiRow label="Total liquidado" value={data.liquidatedTotal} emphasize />
        <div className="border-t border-border/40 my-2" />
        <KpiRow label="Cobrado expensas" value={data.collectedOrdinary} />
        <KpiRow label="Cobrado extraordinarias" value={data.collectedExtraordinary} muted />
        <KpiRow label="Total cobrado" value={data.collectedTotal} emphasize />

        {ratio !== null ? (
          <div className="mt-2 rounded-xl border border-border/40 bg-muted/30 p-3 flex items-center gap-3">
            {ratio >= 80 ? (
              <TrendingUp className={`w-5 h-5 ${ratioTone}`} />
            ) : (
              <TrendingDown className={`w-5 h-5 ${ratioTone}`} />
            )}
            <div>
              <div className="text-xs text-muted-foreground">Tasa de cobranza</div>
              <div className={`font-serif text-2xl font-bold tabular-nums ${ratioTone}`}>{ratio}%</div>
            </div>
          </div>
        ) : null}
      </div>
    </Widget>
  )
}

function KpiRow({
  label,
  value,
  emphasize,
  muted,
}: {
  label: string
  value: number
  emphasize?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
      <span
        className={`tabular-nums ${
          emphasize ? 'font-serif text-lg font-bold text-foreground' : muted ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        <Money amount={value} minimumFractionDigits={0} maximumFractionDigits={0} />
      </span>
    </div>
  )
}

// ----------------------------------------------------------------------------
// 4. Overdue (deudas residentes)
// ----------------------------------------------------------------------------

export function OverdueWidget({
  buckets,
  totalAmount,
  totalUnits,
}: {
  buckets: IAdminOverdueBucket[]
  totalAmount: number
  totalUnits: number
}) {
  return (
    <Widget
      title="Deudas de residentes"
      subtitle="Liquidaciones emitidas sin cobrar (aproximado)"
      action={
        <div className="flex items-center gap-1 rounded-full bg-rose-100 border border-rose-200 px-3 py-1 text-xs text-rose-800">
          <AlertTriangle className="w-3 h-3" />
          {totalUnits} unidades
        </div>
      }
    >
      {buckets.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          No hay deudas registradas. Todo al dia 👍
        </div>
      ) : (
        <ul className="divide-y divide-border/30">
          {buckets.slice(0, 6).map((b) => (
            <li key={b.periodLabel} className="flex items-center justify-between px-5 py-3 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <div>
                  <div className="text-foreground">{b.periodLabel}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {b.periodsOld} periodo{b.periodsOld === 1 ? '' : 's'} · {b.unitsCount} unidad{b.unitsCount === 1 ? '' : 'es'}
                  </div>
                </div>
              </div>
              <span className="font-medium tabular-nums text-rose-700">
                <Money amount={b.totalAmount} minimumFractionDigits={0} maximumFractionDigits={0} />
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between px-5 py-3 text-sm bg-muted/40">
            <span className="font-semibold">Total</span>
            <span className="font-serif text-xl font-bold tabular-nums text-rose-800">
              <Money amount={totalAmount} minimumFractionDigits={0} maximumFractionDigits={0} />
            </span>
          </li>
        </ul>
      )}
    </Widget>
  )
}

// ----------------------------------------------------------------------------
// Fila resumen superior (4 KPI chiquitos)
// ----------------------------------------------------------------------------

export function DashboardQuickStats({
  activeUnits,
  pendingExpenses,
  pendingDocuments,
  totalBalance,
}: {
  activeUnits: number
  pendingExpenses: number
  pendingDocuments: number
  totalBalance: number
}) {
  const stats = [
    { label: 'Unidades activas', value: activeUnits.toString(), icon: Banknote },
    { label: 'Gastos a revisar', value: pendingExpenses.toString(), icon: Receipt },
    { label: 'Docs por validar', value: pendingDocuments.toString(), icon: AlertTriangle },
    { label: 'Saldo total', value: <Money amount={totalBalance} minimumFractionDigits={0} maximumFractionDigits={0} />, icon: Wallet },
  ]
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {stats.map((s) => {
        const Icon = s.icon
        return (
          <div key={s.label} className="glass-card rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
              <div className="font-serif text-xl font-bold text-foreground tabular-nums mt-0.5">{s.value}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
