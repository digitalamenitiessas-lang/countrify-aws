'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileCheck2,
  Lock,
  TrendingDown,
  TrendingUp,
  Users2,
  Wallet,
} from 'lucide-react'
import { Sparkline } from '@/components/admin-backoffice/shared/sparkline'
import { AnimatedNumber } from '@/components/admin-backoffice/shared/animated-number'
import { MesaEvolutionChart } from '@/components/admin-backoffice/consorcio/mesa-evolution-chart'
import type { IAdminMesaState, IAdminMonthlyGrid } from '@/lib/types'

type Props = {
  grid: IAdminMonthlyGrid
  state: IAdminMesaState
  visibleRange: 3 | 6 | 12
  onChangeRange: (range: 3 | 6 | 12) => void
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
}

function monthName(month: number, year: number): string {
  const names = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ]
  return `${names[month - 1]} ${year}`
}

type MonthStatusKind = 'pristine' | 'draft' | 'calculated' | 'issued' | 'closed'
type StatusTone = 'muted' | 'neutral' | 'info' | 'success' | 'locked'

type MonthStatus = {
  kind: MonthStatusKind
  label: string
  icon: typeof Clock3
  tone: StatusTone
  live: boolean // true → pulsa el dot ("mes en curso")
}

function resolveStatus(grid: IAdminMonthlyGrid, state: IAdminMesaState): MonthStatus {
  const current = grid.months[grid.months.length - 1]
  if (state.runStatus === 'issued') return { kind: 'issued', label: 'Emitida', icon: CheckCircle2, tone: 'success', live: false }
  if (state.runStatus === 'closed') return { kind: 'closed', label: 'Cerrada', icon: Lock, tone: 'locked', live: false }
  if (state.runStatus === 'calculated') return { kind: 'calculated', label: 'Calculada', icon: FileCheck2, tone: 'info', live: true }
  if (current.total > 0 || grid.readyToEmit) return { kind: 'draft', label: 'En curso', icon: Clock3, tone: 'neutral', live: true }
  return { kind: 'pristine', label: 'Sin cargar', icon: Clock3, tone: 'muted', live: false }
}

const TONE_CLASSES: Record<StatusTone, { chip: string; dot: string }> = {
  muted:   { chip: 'bg-muted text-muted-foreground border-border',            dot: 'text-muted-foreground' },
  neutral: { chip: 'bg-amber-50 text-amber-900 border-amber-200',            dot: 'text-amber-500' },
  info:    { chip: 'bg-sky-50 text-sky-900 border-sky-200',                  dot: 'text-sky-500' },
  success: { chip: 'bg-emerald-50 text-emerald-900 border-emerald-200',      dot: 'text-emerald-500' },
  locked:  { chip: 'bg-slate-100 text-slate-700 border-slate-300',           dot: 'text-slate-500' },
}

export function MesaHeader({ grid, state, visibleRange, onChangeRange }: Props) {
  const [chartOpen, setChartOpen] = useState(false)

  // Permitir toggle externo del chart vía evento (desde command palette)
  useEffect(() => {
    function onToggle() {
      setChartOpen((v) => !v)
    }
    window.addEventListener('mesa:toggle-chart', onToggle)
    return () => window.removeEventListener('mesa:toggle-chart', onToggle)
  }, [])

  const current = grid.months[grid.months.length - 1]
  const previous = grid.months[grid.months.length - 2] ?? null

  const currentTotal = current.total ?? 0
  const previousTotal = previous?.total ?? 0
  const deltaPct =
    previousTotal > 0 ? Math.round(((currentTotal - previousTotal) / previousTotal) * 1000) / 10 : null

  const status = resolveStatus(grid, state)
  const tone = TONE_CLASSES[status.tone]
  const StatusIcon = status.icon

  const unitsWithBalance = state.units.filter((u) => u.balance > 0.01).length
  const unitsPaid = state.units.filter((u) => u.subtotal > 0 && u.balance < 0.01).length
  const unitsTotal = state.units.length
  const paidPct = unitsTotal > 0 ? Math.round((unitsPaid / unitsTotal) * 100) : 0

  const totalsSeries = grid.months.map((m) => ((m.total ?? 0) > 0 ? m.total : null))

  return (
    <section className="mesa-card overflow-hidden">
      <header className="px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
            Mesa del mes
          </p>
          <h1 className="font-serif text-3xl font-bold text-foreground capitalize leading-[1.05] mt-0.5">
            {monthName(current.month, current.year)}
          </h1>
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone.chip}`}
            >
              <span className={tone.dot}>
                {status.live ? (
                  <span className="live-dot inline-block align-middle" aria-hidden />
                ) : (
                  <StatusIcon className="w-3 h-3" />
                )}
              </span>
              {status.label}
            </span>
            {current.periodStatus === 'locked' || current.periodStatus === 'closed' ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px]">
                <Lock className="w-2.5 h-2.5" /> Período {current.periodStatus}
              </span>
            ) : null}
            {!state.coverageOk ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 text-[10px]">
                <AlertTriangle className="w-2.5 h-2.5" />
                Alícuotas {(state.alicuotaSum * 100).toFixed(2)}% ≠ 100%
              </span>
            ) : null}
          </div>
        </div>

        <div className="seg" role="group" aria-label="Rango de meses visible">
          {([3, 6, 12] as const).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={visibleRange === n}
              onClick={() => onChangeRange(n)}
              title={`Últimos ${n} meses`}
            >
              {n}m
            </button>
          ))}
        </div>
      </header>

      <div className="divider-soft" />

      <div className="grid grid-cols-2 md:grid-cols-4">
        <KpiCard
          icon={Wallet}
          label="Total del mes"
          value={currentTotal}
          format={(n) => (n > 0 ? `$ ${formatARS(n)}` : '—')}
          deltaPct={deltaPct}
          previousLabel={previous?.label}
          sparkline={<Sparkline values={totalsSeries} width={82} height={24} />}
          onClick={() => setChartOpen((v) => !v)}
          expandIcon={chartOpen ? ChevronUp : BarChart3}
          expanded={chartOpen}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Cobrado del mes"
          value={state.hasRun ? (state.collectionRatePct ?? 0) : 0}
          format={(n) => (state.hasRun ? `${Math.round(n)}%` : '—')}
          hint={
            state.hasRun
              ? `$ ${formatARS(state.totalCollected)} / $ ${formatARS(
                  state.totalToDistribute + state.previousBalanceTotal,
                )}`
              : 'Pendiente de emitir'
          }
        />
        <KpiCard
          icon={AlertTriangle}
          label="Saldo pendiente"
          value={state.totalPending}
          format={(n) => (n > 0 ? `$ ${formatARS(n)}` : '—')}
          hint={
            unitsWithBalance > 0
              ? `${unitsWithBalance} ${unitsWithBalance === 1 ? 'unidad debe' : 'unidades deben'}`
              : state.hasRun
                ? 'todas al día'
                : ''
          }
          hintTone={unitsWithBalance > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          icon={Users2}
          label="Unidades al día"
          value={unitsPaid}
          format={() => (unitsTotal > 0 ? `${unitsPaid} / ${unitsTotal}` : '—')}
          hint={unitsTotal > 0 ? `${paidPct}% del padrón` : 'Sin unidades activas'}
        />
      </div>

      {chartOpen ? (
        <>
          <div className="divider-soft" />
          <MesaEvolutionChart months={grid.months} />
        </>
      ) : null}
    </section>
  )
}

type HintTone = 'muted' | 'success' | 'warning'

function KpiCard({
  icon: Icon,
  label,
  value,
  format,
  hint,
  hintTone = 'muted',
  deltaPct,
  previousLabel,
  sparkline,
  onClick,
  expandIcon: ExpandIcon,
  expanded,
}: {
  icon: typeof Wallet
  label: string
  value: number
  format: (n: number) => string
  hint?: string
  hintTone?: HintTone
  deltaPct?: number | null
  previousLabel?: string
  sparkline?: React.ReactNode
  onClick?: () => void
  expandIcon?: typeof Wallet
  expanded?: boolean
}) {
  const hintColor =
    hintTone === 'success'
      ? 'text-emerald-700'
      : hintTone === 'warning'
        ? 'text-amber-800'
        : 'text-muted-foreground'

  const deltaTone: 'up' | 'down' | 'flat' | null =
    deltaPct === null || deltaPct === undefined
      ? null
      : Math.abs(deltaPct) < 0.1
        ? 'flat'
        : deltaPct > 0
          ? 'up'
          : 'down'

  const interactive = typeof onClick === 'function'

  const body = (
    <>
      <div className="w-9 h-9 rounded-xl kpi-icon-disc flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium flex items-center gap-1.5">
          {label}
          {interactive && ExpandIcon ? (
            <ExpandIcon
              className={`w-3 h-3 transition-colors ${expanded ? 'text-primary' : 'text-muted-foreground/50'}`}
            />
          ) : null}
        </p>
        <p className="stat-value font-serif text-[22px] font-semibold text-foreground leading-tight mt-0.5 truncate">
          <AnimatedNumber value={value} format={format} />
        </p>
        <div className={`text-[11px] ${hintColor} mt-1 flex items-center gap-1.5 flex-wrap`}>
          {deltaTone ? (
            <span className="delta-pill" data-tone={deltaTone}>
              {deltaTone === 'up' ? (
                <TrendingUp className="w-2.5 h-2.5" />
              ) : deltaTone === 'down' ? (
                <TrendingDown className="w-2.5 h-2.5" />
              ) : null}
              {deltaPct! >= 0 ? '+' : ''}
              {deltaPct!.toFixed(1)}%
            </span>
          ) : null}
          {deltaTone && previousLabel ? (
            <span className="text-muted-foreground">vs {previousLabel}</span>
          ) : null}
          {hint ? <span className="truncate">{hint}</span> : null}
          {interactive ? (
            <span className="text-[10px] text-primary/80 underline-offset-2 hover:underline">
              {expanded ? 'ocultar gráfico' : 'ver gráfico'}
            </span>
          ) : null}
        </div>
      </div>
      {sparkline ? <div className="shrink-0 pt-1 -mr-1">{sparkline}</div> : null}
    </>
  )

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        className="kpi-cell px-5 py-4 flex items-start gap-3 border-r border-border/30 last:border-r-0 md:[&:nth-child(2n)]:border-r-0 md:[&:nth-child(n)]:border-r text-left w-full cursor-pointer"
      >
        {body}
      </button>
    )
  }

  return (
    <div className="kpi-cell px-5 py-4 flex items-start gap-3 border-r border-border/30 last:border-r-0 md:[&:nth-child(2n)]:border-r-0 md:[&:nth-child(n)]:border-r">
      {body}
    </div>
  )
}
