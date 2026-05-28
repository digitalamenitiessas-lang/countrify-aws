import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  Megaphone,
  PiggyBank,
  Receipt,
  ScrollText,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Money } from '@/components/admin-backoffice/shared/money'
import type { IAdminPortfolioOverview } from '@/lib/types'

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

type Props = {
  overview: IAdminPortfolioOverview
  administratorName: string
}

type ActionableAlert = {
  label: string
  detail?: string
  href: string
  tone: 'danger' | 'warning' | 'info'
  icon: typeof AlertTriangle
}

export function IAdminDashboard({ overview, administratorName }: Props) {
  const { rows, totals, administration } = overview
  const now = new Date()
  const periodLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`

  // Tasa de cobranza global (mes en curso)
  const globalRate =
    totals.totalLiquidatedMonth > 0
      ? Math.round((totals.totalCollectedMonth / totals.totalLiquidatedMonth) * 100)
      : null

  // Estado de períodos del mes
  const propertiesWithoutPeriod = rows.filter(
    (r) => !r.hasOpenPeriod && !r.runStatusThisMonth,
  )
  const propertiesWithLowCollection = rows.filter(
    (r) => r.collectionRatePct !== null && r.collectionRatePct < 50,
  )
  const propertiesWithNegativeBalance = rows.filter((r) => r.totalBalance < 0)

  const alerts: ActionableAlert[] = []
  if (totals.pendingExpenses > 0) {
    alerts.push({
      label: `${totals.pendingExpenses} gasto${totals.pendingExpenses === 1 ? '' : 's'} sin imputar`,
      detail: 'Falta asignar a un período o cargar documentación',
      href: '/iadmin/gastos',
      tone: 'warning',
      icon: Receipt,
    })
  }
  if (propertiesWithoutPeriod.length > 0) {
    alerts.push({
      label: `${propertiesWithoutPeriod.length} consorcio${propertiesWithoutPeriod.length === 1 ? '' : 's'} sin período abierto`,
      detail: `Para ${periodLabel} todavía no se generó la mesa`,
      href: '/iadmin/liquidaciones',
      tone: 'warning',
      icon: ScrollText,
    })
  }
  if (propertiesWithLowCollection.length > 0) {
    alerts.push({
      label: `${propertiesWithLowCollection.length} consorcio${propertiesWithLowCollection.length === 1 ? '' : 's'} con cobranza baja`,
      detail: 'Tasa de cobranza menor al 50% en el mes',
      href: '/iadmin/cobranzas',
      tone: 'warning',
      icon: TrendingDown,
    })
  }
  if (propertiesWithNegativeBalance.length > 0) {
    alerts.push({
      label: `${propertiesWithNegativeBalance.length} cuenta${propertiesWithNegativeBalance.length === 1 ? '' : 's'} con saldo negativo`,
      detail: 'Revisá movimientos del fondo operativo',
      href: '/iadmin/cartera',
      tone: 'danger',
      icon: ShieldAlert,
    })
  }

  const hasAnyData = rows.length > 0

  return (
    <div className="space-y-6">
      {/* Saludo + estado del período */}
      <section className="glass-card rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-primary font-medium">Inicio</p>
            <h1 className="font-serif text-2xl font-bold text-foreground mt-1">
              {administration.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {administratorName ? `Hola ${administratorName.split(' ')[0]}. ` : ''}
              Resumen operativo de toda la cartera.
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-background px-4 py-3 text-right shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground justify-end">
              <CalendarClock className="w-3 h-3" />
              Período en curso
            </div>
            <div className="mt-0.5 font-serif text-lg font-bold text-foreground">{periodLabel}</div>
          </div>
        </div>
      </section>

      {!hasAnyData ? (
        <section className="glass-card rounded-2xl p-10 text-center">
          <Wallet className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <h2 className="font-serif text-lg font-semibold text-foreground">
            Todavía no hay consorcios cargados
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Empezá agregando tu primer country desde Cartera.
          </p>
          <Link
            href="/iadmin/cartera"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Ir a Cartera <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </section>
      ) : (
        <>
          {/* KPIs principales */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={TrendingUp}
              label="Cobrado del mes"
              value={<Money amount={totals.totalCollectedMonth} minimumFractionDigits={0} maximumFractionDigits={0} />}
              hint={
                globalRate !== null
                  ? `${globalRate}% sobre liquidado`
                  : 'Sin liquidaciones emitidas'
              }
              tone={globalRate !== null && globalRate >= 70 ? 'success' : globalRate !== null && globalRate < 40 ? 'danger' : undefined}
              href="/iadmin/cobranzas"
            />
            <KpiCard
              icon={AlertTriangle}
              label="Morosidad acumulada"
              value={<Money amount={totals.totalOverdue} minimumFractionDigits={0} maximumFractionDigits={0} />}
              hint={
                totals.totalOverdue > 0
                  ? 'Suma de saldos vencidos de vecinos'
                  : 'Sin deuda pendiente'
              }
              tone={totals.totalOverdue > 0 ? 'warning' : 'success'}
              href="/iadmin/cobranzas"
            />
            <KpiCard
              icon={Receipt}
              label="Gastos del mes"
              value={<Money amount={totals.totalPayable} minimumFractionDigits={0} maximumFractionDigits={0} />}
              hint={
                totals.pendingExpenses > 0
                  ? `${totals.pendingExpenses} a revisar`
                  : 'Todo imputado'
              }
              tone={totals.pendingExpenses > 0 ? 'warning' : undefined}
              href="/iadmin/gastos"
            />
            <KpiCard
              icon={PiggyBank}
              label="Saldo en cuentas"
              value={<Money amount={totals.totalBalance} minimumFractionDigits={0} maximumFractionDigits={0} />}
              hint="Total disponible en fondos"
              tone={totals.totalBalance < 0 ? 'danger' : undefined}
              href="/iadmin/cartera"
            />
          </section>

          {/* Alertas accionables */}
          <section className="glass-card rounded-2xl overflow-hidden">
            <header className="px-5 py-4 border-b border-border/40">
              <h2 className="font-serif text-lg font-semibold text-foreground">
                Acciones pendientes
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Las cosas que conviene resolver antes de cerrar el mes.
              </p>
            </header>
            {alerts.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-600 mb-2" />
                <p className="text-sm font-medium text-foreground">Todo al día</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  No hay alertas operativas en este momento.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/30">
                {alerts.map((alert, idx) => {
                  const Icon = alert.icon
                  const toneBg =
                    alert.tone === 'danger'
                      ? 'bg-rose-100 text-rose-700'
                      : alert.tone === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-sky-100 text-sky-700'
                  return (
                    <li key={idx}>
                      <Link
                        href={alert.href}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors group"
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${toneBg}`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground">{alert.label}</div>
                          {alert.detail ? (
                            <div className="text-xs text-muted-foreground mt-0.5">{alert.detail}</div>
                          ) : null}
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Atajos rápidos */}
          <section>
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3 px-1">
              Atajos rápidos
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <QuickAction
                icon={Receipt}
                label="Registrar gasto"
                hint="Cargar factura de proveedor"
                href="/iadmin/gastos"
              />
              <QuickAction
                icon={ScrollText}
                label="Liquidar período"
                hint="Cerrar y emitir expensas"
                href="/iadmin/liquidaciones"
              />
              <QuickAction
                icon={Wallet}
                label="Registrar cobranza"
                hint="Pago recibido de un vecino"
                href="/iadmin/cobranzas"
              />
              <QuickAction
                icon={Megaphone}
                label="Publicar comunicado"
                hint="Avisar a todo el country"
                href="/iadmin/comunicaciones"
              />
            </div>
          </section>

          {/* Resumen por consorcio (solo si hay >1) */}
          {rows.length > 1 ? (
            <section className="glass-card rounded-2xl overflow-hidden">
              <header className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-lg font-semibold text-foreground">
                    Estado por consorcio
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click para abrir la mesa del mes.
                  </p>
                </div>
                <Link
                  href="/iadmin/cartera"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  Ver cartera completa <ArrowRight className="w-3 h-3" />
                </Link>
              </header>
              <ul className="divide-y divide-border/30">
                {rows.slice(0, 5).map((row) => {
                  const rate = row.collectionRatePct
                  const rateTone =
                    rate === null
                      ? 'text-muted-foreground'
                      : rate >= 80
                        ? 'text-emerald-700'
                        : rate >= 50
                          ? 'text-amber-700'
                          : 'text-rose-700'
                  return (
                    <li key={row.property.id}>
                      <Link
                        href={`/iadmin/consorcios/${row.property.id}`}
                        className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground truncate">
                            {row.property.displayName ?? row.property.buildingName}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {row.property.totalUnits} unidades
                            {row.alerts.length > 0 ? ` · ${row.alerts.length} alerta${row.alerts.length === 1 ? '' : 's'}` : ''}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-sm font-medium tabular-nums ${rateTone}`}>
                            {rate !== null ? `${rate}%` : '—'}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                            cobrado
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  href,
}: {
  icon: typeof Wallet
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'warning' | 'danger' | 'success'
  href?: string
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-rose-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'success'
          ? 'text-emerald-700'
          : 'text-foreground'
  const Wrapper = href ? Link : 'div'
  const wrapperProps = href ? { href } : {}
  return (
    <Wrapper
      {...(wrapperProps as { href: string })}
      className={`glass-card rounded-2xl p-4 ${href ? 'hover:ring-1 hover:ring-primary/30 transition-all cursor-pointer' : ''}`}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={`mt-2 font-serif text-2xl font-bold tabular-nums leading-none ${toneClass}`}>
        {value}
      </div>
      {hint ? <div className="text-xs text-muted-foreground mt-2">{hint}</div> : null}
    </Wrapper>
  )
}

function QuickAction({
  icon: Icon,
  label,
  hint,
  href,
}: {
  icon: typeof Receipt
  label: string
  hint: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="glass-card rounded-2xl p-4 hover:ring-1 hover:ring-primary/30 transition-all group"
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
        {label}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
    </Link>
  )
}

// Suprimir warning del icon FileSpreadsheet importado por si lo usamos más adelante
void FileSpreadsheet
