'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Loader2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/admin-backoffice/shared/money'
import { generateProjection, type ProjectionResult } from '@/app/iadmin/consorcios/[id]/proyecciones/actions'

export function ProjectionCard({ propertyId }: { propertyId: string }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ProjectionResult | null>(null)

  function handleGenerate() {
    startTransition(async () => {
      try {
        const r = await generateProjection({ propertyId })
        setResult(r)
        toast.success('Proyeccion lista')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al generar')
      }
    })
  }

  return (
    <section className="glass-card rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-border/40 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-serif text-lg font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Proyeccion con IA
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Analisis del proximo periodo basado en los ultimos 6 meses de actividad.
          </p>
        </div>
        <Button size="sm" onClick={handleGenerate} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Analizando…
            </>
          ) : result ? (
            'Regenerar'
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Generar proyeccion
            </>
          )}
        </Button>
      </header>

      {!result ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          Click en "Generar proyeccion" y la IA analiza tu historial: gastos recientes, tasa de cobranza,
          saldo disponible, y proyecta el proximo mes con recomendaciones.
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {/* Narrative */}
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
            <div className="text-xs uppercase tracking-wider text-primary mb-1.5">Resumen ejecutivo</div>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{result.narrative}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label={`Gastos estimados ${result.periodLabel}`}
              value={<Money amount={result.expectedTotalExpenses} />}
            />
            {result.recommendedOrdinaryPerUnit !== null ? (
              <Stat
                label="Expensa sugerida por unidad"
                value={<Money amount={result.recommendedOrdinaryPerUnit} />}
                tone="primary"
              />
            ) : null}
            <Stat
              label="Tasa de cobranza esperada"
              value={`${result.collectionsAssessment.expectedRatePct}%`}
              tone={
                result.collectionsAssessment.expectedRatePct >= 80
                  ? 'ok'
                  : result.collectionsAssessment.expectedRatePct >= 60
                    ? 'warning'
                    : 'danger'
              }
            />
            <Stat
              label="Saldo al cierre proyectado"
              value={<Money amount={result.cashProjection.endingBalance} />}
              tone={result.cashProjection.endingBalance < 0 ? 'danger' : 'ok'}
            />
          </div>

          {/* Cash projection breakdown */}
          <div className="rounded-xl bg-muted/30 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <MiniRow label="Saldo actual" value={<Money amount={result.cashProjection.currentBalance} />} />
            <MiniRow
              label="Ingresos esperados"
              value={<Money amount={result.cashProjection.expectedIncome} />}
              tone="ok"
            />
            <MiniRow
              label="Egresos esperados"
              value={<Money amount={-result.cashProjection.expectedExpenses} />}
              tone="danger"
            />
            <MiniRow
              label="Saldo al cierre"
              value={<Money amount={result.cashProjection.endingBalance} />}
              emphasize
              tone={result.cashProjection.endingBalance < 0 ? 'danger' : 'ok'}
            />
          </div>

          {/* Alerts */}
          {result.alerts.length > 0 ? (
            <div className="space-y-2">
              {result.alerts.map((a, idx) => {
                const tone =
                  a.severity === 'danger'
                    ? 'border-rose-300 bg-rose-50 text-rose-900'
                    : a.severity === 'warning'
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : 'border-sky-200 bg-sky-50 text-sky-900'
                return (
                  <div key={idx} className={`rounded-lg border px-3 py-2 text-sm flex items-start gap-2 ${tone}`}>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{a.message}</span>
                  </div>
                )
              })}
            </div>
          ) : null}

          {/* Expected lines */}
          {result.lines.length > 0 ? (
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <header className="px-4 py-2.5 bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                Detalle estimado de egresos
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border/30">
                    <th className="text-left px-4 py-2 font-medium">Categoria</th>
                    <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                    <th className="text-right px-4 py-2 font-medium">Estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((line, idx) => (
                    <tr key={idx} className="border-b border-border/20 last:border-0">
                      <td className="px-4 py-2 text-foreground">{line.category}</td>
                      <td className="px-4 py-2 text-muted-foreground">{line.providerName ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <Money amount={line.expected} />
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/30 font-medium">
                    <td className="px-4 py-2" colSpan={2}>Total estimado</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <Money amount={result.expectedTotalExpenses} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="text-[11px] text-muted-foreground italic">
            Las cifras son estimaciones de IA sobre tu historial y pueden variar. Usalas como guia, no como contabilidad definitiva.
          </p>
        </div>
      )}
    </section>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: React.ReactNode
  tone?: 'ok' | 'warning' | 'danger' | 'primary'
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'danger'
          ? 'text-rose-700'
          : tone === 'primary'
            ? 'text-primary'
            : 'text-foreground'
  const Icon = tone === 'danger' ? TrendingDown : tone === 'ok' ? TrendingUp : null
  return (
    <div className="rounded-xl bg-background border border-border/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-serif text-xl font-bold tabular-nums flex items-center gap-1.5 ${toneClass}`}>
        {Icon ? <Icon className="w-4 h-4" /> : null}
        {value}
      </div>
    </div>
  )
}

function MiniRow({
  label,
  value,
  emphasize,
  tone,
}: {
  label: string
  value: React.ReactNode
  emphasize?: boolean
  tone?: 'ok' | 'danger'
}) {
  const toneClass = tone === 'ok' ? 'text-emerald-700' : tone === 'danger' ? 'text-rose-700' : 'text-foreground'
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-${emphasize ? 'serif' : 'sans'} ${emphasize ? 'text-lg font-bold' : 'text-sm font-medium'} tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  )
}
