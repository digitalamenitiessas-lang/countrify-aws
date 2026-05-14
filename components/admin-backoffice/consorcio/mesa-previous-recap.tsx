'use client'

import { ArrowRight, BellRing, CheckCircle2, Clock3, ExternalLink } from 'lucide-react'
import type { IAdminMesaState, IAdminMonthlyGrid } from '@/lib/types'

type Props = {
  previousMonth: IAdminMonthlyGrid['months'][number]
  previousState: IAdminMesaState
}

const MONTH_LABELS_ES = [
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

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
}

/**
 * Ribbon sutil que muestra un recap del mes anterior cuando ya tiene
 * liquidación emitida. Da contexto + empuja a recordar pagos pendientes.
 */
export function MesaPreviousRecap({ previousMonth, previousState }: Props) {
  if (!previousState.hasRun) return null

  const monthName = `${MONTH_LABELS_ES[previousMonth.month - 1]} ${previousMonth.year}`
  const totalBilled = previousState.totalToDistribute + previousState.previousBalanceTotal
  const collectedPct = previousState.collectionRatePct ?? 0
  const unitsWithDebt = previousState.units.filter((u) => u.balance > 0.01).length
  const unitsTotal = previousState.units.length
  const fullyCollected = unitsWithDebt === 0 && unitsTotal > 0

  const tone = fullyCollected
    ? {
        card: 'border-emerald-200 bg-emerald-50/70',
        icon: 'bg-emerald-100 text-emerald-700',
        accent: 'text-emerald-700',
      }
    : collectedPct >= 70
      ? {
          card: 'border-border/40 bg-gradient-to-r from-amber-50/50 via-background to-background',
          icon: 'bg-amber-100 text-amber-700',
          accent: 'text-amber-800',
        }
      : {
          card: 'border-rose-200 bg-gradient-to-r from-rose-50/70 via-background to-background',
          icon: 'bg-rose-100 text-rose-700',
          accent: 'text-rose-800',
        }

  const Icon = fullyCollected ? CheckCircle2 : Clock3

  return (
    <section
      className={`mesa-card overflow-hidden px-5 py-3 flex items-center gap-3 flex-wrap ${tone.card} !border`}
      style={{ paddingTop: 12, paddingBottom: 12 }}
    >
      <div className={`w-9 h-9 rounded-xl ${tone.icon} flex items-center justify-center shrink-0`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          Mes anterior · <span className="capitalize">{monthName}</span>
        </p>
        <p className="text-sm text-foreground mt-0.5">
          Emitiste{' '}
          <span className="font-medium tabular-nums">$ {formatARS(totalBilled)}</span>
          {' · '}
          {fullyCollected ? (
            <span className={`font-medium ${tone.accent}`}>todos al día ✓</span>
          ) : (
            <>
              <span className={`font-medium ${tone.accent}`}>{collectedPct}% cobrado</span>
              {unitsWithDebt > 0 ? (
                <span className="text-muted-foreground">
                  {' · '}
                  <span className="font-medium text-foreground">{unitsWithDebt}</span>{' '}
                  {unitsWithDebt === 1 ? 'vecino debe' : 'residentes deben'}
                </span>
              ) : null}
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {!fullyCollected && unitsWithDebt > 0 ? (
          <a
            href={`/iadmin/recordatorios`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background px-3 py-1 text-[11px] text-foreground hover:border-primary/40 hover:bg-muted/30 transition-colors"
          >
            <BellRing className="w-3 h-3" />
            Recordar
          </a>
        ) : null}
        {previousMonth.runId ? (
          <a
            href={`/iadmin/liquidaciones/${previousMonth.runId}`}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Ver liquidación
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <ArrowRight className="w-3 h-3" />
          </span>
        )}
      </div>
    </section>
  )
}
