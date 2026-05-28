'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Lock,
  Pencil,
  Send,
} from 'lucide-react'
import type { IAdminLiquidationRunSummary, IAdminLiquidationStatus } from '@/lib/types'
import { Money } from '@/components/admin-backoffice/shared/money'

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

const STATUS_META: Record<
  IAdminLiquidationStatus,
  { label: string; tone: string; icon: typeof Lock; hint: string }
> = {
  draft: {
    label: 'Borrador',
    tone: 'bg-muted text-muted-foreground',
    icon: Pencil,
    hint: 'Aún editable. Podés agregar/quitar gastos.',
  },
  calculated: {
    label: 'Calculada',
    tone: 'bg-amber-100 text-amber-800',
    icon: CircleDot,
    hint: 'Totales calculados. Revisá antes de emitir.',
  },
  issued: {
    label: 'Emitida',
    tone: 'bg-sky-100 text-sky-800',
    icon: Send,
    hint: 'Liquidación emitida. Los vecinos ya pueden ver sus expensas.',
  },
  closed: {
    label: 'Cerrada',
    tone: 'bg-emerald-100 text-emerald-800',
    icon: Lock,
    hint: 'Período cerrado. No se puede re-emitir ni modificar.',
  },
}

const STATUS_FILTERS: ReadonlyArray<{ value: 'all' | IAdminLiquidationStatus; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'draft', label: 'Borrador' },
  { value: 'calculated', label: 'Calculadas' },
  { value: 'issued', label: 'Emitidas' },
  { value: 'closed', label: 'Cerradas' },
]

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function periodLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

type PeriodGroup = {
  key: string
  year: number
  month: number
  label: string
  runs: IAdminLiquidationRunSummary[]
  isCurrent: boolean
}

export function LiquidationsTable({ runs }: { runs: IAdminLiquidationRunSummary[] }) {
  const [statusFilter, setStatusFilter] = useState<'all' | IAdminLiquidationStatus>('all')

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return runs
    return runs.filter((r) => r.status === statusFilter)
  }, [runs, statusFilter])

  const groups: PeriodGroup[] = useMemo(() => {
    const now = new Date()
    const currentKey = periodKey(now.getFullYear(), now.getMonth() + 1)
    const byKey = new Map<string, PeriodGroup>()
    for (const run of filtered) {
      const k = periodKey(run.periodYear, run.periodMonth)
      if (!byKey.has(k)) {
        byKey.set(k, {
          key: k,
          year: run.periodYear,
          month: run.periodMonth,
          label: periodLabel(run.periodYear, run.periodMonth),
          runs: [],
          isCurrent: k === currentKey,
        })
      }
      byKey.get(k)!.runs.push(run)
    }
    // Orden: período más reciente primero.
    return Array.from(byKey.values()).sort((a, b) => b.key.localeCompare(a.key))
  }, [filtered])

  if (runs.length === 0) {
    return (
      <div className="glass-card rounded-2xl px-5 py-12 text-center text-sm text-muted-foreground">
        Aún no hay corridas de liquidación. Generá la primera desde la Mesa del mes de un
        consorcio con período abierto.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros de estado */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUS_FILTERS.map((f) => {
          const isActive = statusFilter === f.value
          const count =
            f.value === 'all' ? runs.length : runs.filter((r) => r.status === f.value).length
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              ].join(' ')}
            >
              {f.label}
              <span
                className={[
                  'tabular-nums text-[10px] rounded-full px-1.5 py-px',
                  isActive ? 'bg-primary-foreground/20' : 'bg-background/60',
                ].join(' ')}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {groups.length === 0 ? (
        <div className="glass-card rounded-2xl px-5 py-10 text-center text-sm text-muted-foreground">
          No hay corridas con el filtro seleccionado.
        </div>
      ) : (
        groups.map((group) => (
          <PeriodCard key={group.key} group={group} />
        ))
      )}
    </div>
  )
}

function PeriodCard({ group }: { group: PeriodGroup }) {
  const totalAmount = group.runs.reduce((sum, r) => sum + r.totalExpenses, 0)
  const closedCount = group.runs.filter((r) => r.status === 'closed').length
  const draftCount = group.runs.filter((r) => r.status === 'draft').length
  const allClosed = closedCount === group.runs.length

  return (
    <section className="glass-card rounded-2xl overflow-hidden">
      <header
        className={[
          'px-5 py-3 flex items-center justify-between gap-3 flex-wrap border-b border-border/40',
          group.isCurrent ? 'bg-primary/5' : 'bg-muted/20',
        ].join(' ')}
      >
        <div className="flex items-center gap-3 min-w-0">
          <CalendarClock
            className={`w-4 h-4 shrink-0 ${group.isCurrent ? 'text-primary' : 'text-muted-foreground'}`}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif text-base font-semibold text-foreground">
                {group.label}
              </h3>
              {group.isCurrent ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary uppercase tracking-wider">
                  Período actual
                </span>
              ) : null}
              {allClosed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-medium">
                  <Lock className="w-2.5 h-2.5" />
                  Todo cerrado
                </span>
              ) : draftCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-medium">
                  {draftCount} en borrador
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {group.runs.length} corrida{group.runs.length === 1 ? '' : 's'} ·{' '}
              <Money amount={totalAmount} /> total
            </p>
          </div>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/30 bg-muted/10">
              <th className="text-left px-5 py-2 font-medium">Consorcio</th>
              <th className="text-left px-5 py-2 font-medium">Estado</th>
              <th className="text-left px-5 py-2 font-medium">Generada</th>
              <th className="text-left px-5 py-2 font-medium">Cerrada</th>
              <th className="text-right px-5 py-2 font-medium">Unidades</th>
              <th className="text-right px-5 py-2 font-medium">Total</th>
              <th className="text-right px-5 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {group.runs.map((run) => {
              const meta = STATUS_META[run.status]
              const Icon = meta.icon
              const isLocked = run.status === 'closed'
              return (
                <tr
                  key={run.id}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/40 transition-colors"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/iadmin/liquidaciones/${run.id}`}
                      className="font-medium text-foreground hover:text-primary inline-flex items-center gap-1.5"
                    >
                      {isLocked ? (
                        <Lock className="w-3 h-3 text-emerald-700" />
                      ) : null}
                      {run.managedPropertyName}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.tone}`}
                      title={meta.hint}
                    >
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">
                    {fmtDate(run.generatedAt)}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">
                    {run.closedAt ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" />
                        {fmtDate(run.closedAt)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-foreground">
                    {run.totalUnits}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-foreground font-medium">
                    <Money amount={run.totalExpenses} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/iadmin/liquidaciones/${run.id}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      Abrir <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
