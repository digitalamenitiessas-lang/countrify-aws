import Link from 'next/link'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Circle, Clock, ListChecks } from 'lucide-react'
import type { IAdminClosingChecklist, IAdminClosingStep } from '@/lib/types'

export function ClosingChecklistCard({ checklist }: { checklist: IAdminClosingChecklist }) {
  const { steps, completedCount, totalCount, progressPct, nextStep, periodLabel } = checklist
  const isDone = completedCount === totalCount

  return (
    <section className="glass-card rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-border/40">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ListChecks className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-semibold text-foreground">
                Cierre del mes <span className="text-muted-foreground font-normal">· {periodLabel}</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isDone ? '¡Todos los pasos completados!' : nextStep ? `Siguiente: ${nextStep.label}` : 'Hay pasos bloqueados'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Progreso</div>
            <div className={`font-serif text-2xl font-bold tabular-nums ${isDone ? 'text-emerald-700' : 'text-foreground'}`}>
              {completedCount}/{totalCount}
            </div>
          </div>
        </div>

        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-primary'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      <ol className="divide-y divide-border/30">
        {steps.map((step, idx) => (
          <StepRow key={step.id} step={step} index={idx} />
        ))}
      </ol>
    </section>
  )
}

function StepRow({ step, index }: { step: IAdminClosingStep; index: number }) {
  const icon = step.done ? (
    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
  ) : step.blockedReason ? (
    <AlertTriangle className="w-5 h-5 text-muted-foreground" />
  ) : step.skipped ? (
    <Clock className="w-5 h-5 text-amber-500" />
  ) : (
    <Circle className="w-5 h-5 text-muted-foreground" />
  )

  return (
    <li className={`px-5 py-3 flex items-start gap-3 ${step.done ? 'opacity-75' : ''}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground tabular-nums">{String(index + 1).padStart(2, '0')}.</span>
          <span className={`text-sm font-medium ${step.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
            {step.label}
          </span>
          {step.blockedReason ? (
            <span className="inline-flex rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px]">
              Bloqueado
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {step.blockedReason ?? step.helper}
        </div>
      </div>
      {!step.done && !step.blockedReason && step.ctaHref && step.ctaLabel ? (
        <Link
          href={step.ctaHref}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        >
          {step.ctaLabel}
          <ArrowRight className="w-3 h-3" />
        </Link>
      ) : null}
      {step.done ? (
        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
      ) : null}
    </li>
  )
}
