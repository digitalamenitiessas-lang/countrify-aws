'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, ListTree, Scale } from 'lucide-react'
import { Money } from '@/components/admin-backoffice/shared/money'
import { EmptyState } from '@/components/admin-backoffice/shared/empty-state'
import type { IAdminMesaState } from '@/lib/types'

export function MesaDistribution({ state }: { state: IAdminMesaState }) {
  const [open, setOpen] = useState(false)

  const hasData = state.totalToDistribute > 0 || state.units.some((u) => u.subtotal > 0)

  return (
    <section className="mesa-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl kpi-icon-disc flex items-center justify-center shrink-0">
            <ListTree className="w-4 h-4" />
          </div>
          <div className="text-left">
            <h3 className="font-serif text-lg font-semibold text-foreground">Distribución por unidad</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasData
                ? `${state.units.length} unidades · a distribuir $ ${state.totalToDistribute.toLocaleString('es-AR')}`
                : 'Cargá gastos en la planilla para ver la distribución'}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && !hasData ? (
        <>
          <div className="divider-soft" />
          <EmptyState
            icon={Scale}
            title="Todavía no hay nada que distribuir"
            description="Cuando cargues gastos en la planilla, acá vas a ver cuánto le toca a cada unidad según su alícuota."
            compact
          />
        </>
      ) : null}

      {open && hasData ? (
        <>
          <div className="divider-soft" />
          {!state.coverageOk ? (
            <div className="mx-5 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              ⚠ Las alícuotas suman {(state.alicuotaSum * 100).toFixed(2)}% en lugar de 100%. Revisá la configuración de unidades.
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/20">
                  <th className="text-left px-4 py-2 font-medium">Unidad</th>
                  <th className="text-left px-4 py-2 font-medium">Titular</th>
                  <th className="text-right px-4 py-2 font-medium">%</th>
                  <th className="text-right px-4 py-2 font-medium">Ordinaria</th>
                  <th className="text-right px-4 py-2 font-medium">Extra.</th>
                  <th className="text-right px-4 py-2 font-medium">Saldo ant.</th>
                  <th className="text-right px-4 py-2 font-medium bg-primary/5">Total</th>
                  {state.dueDates.map((d) => (
                    <th key={d.label} className="text-right px-4 py-2 font-medium text-[10px] bg-primary/10">
                      {d.label}
                      <br />
                      <span className="font-normal text-muted-foreground">{d.date}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.units.map((u) => (
                  <tr key={u.unitId} className="border-b border-border/20 last:border-0">
                    <td className="px-4 py-1.5 font-medium text-foreground">{u.unitCode}</td>
                    <td className="px-4 py-1.5 text-muted-foreground">{u.holderName ?? <span className="italic">—</span>}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                      {(u.prorataCoefficient * 100).toFixed(4)}%
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums">
                      {u.ordinary > 0 ? u.ordinary.toLocaleString('es-AR') : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums">
                      {u.extraordinary > 0 ? u.extraordinary.toLocaleString('es-AR') : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums">
                      {u.previousBalance > 0 ? u.previousBalance.toLocaleString('es-AR') : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums font-medium bg-primary/5">
                      {u.subtotal > 0 ? u.subtotal.toLocaleString('es-AR') : '—'}
                    </td>
                    {u.dueAmounts.map((d) => (
                      <td key={d.label} className="px-4 py-1.5 text-right tabular-nums bg-primary/5">
                        {d.amount > 0 ? d.amount.toLocaleString('es-AR') : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-muted/40 font-medium">
                  <td colSpan={3} className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {state.ordinaryTotal.toLocaleString('es-AR')}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {state.extraordinaryTotal.toLocaleString('es-AR')}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {state.previousBalanceTotal.toLocaleString('es-AR')}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums bg-primary/5">
                    <Money amount={state.totalToDistribute + state.previousBalanceTotal} />
                  </td>
                  {state.dueDates.map((d) => (
                    <td key={d.label} className="px-4 py-2 text-right tabular-nums bg-primary/5">
                      <Money amount={state.units.reduce((s, u) => s + (u.dueAmounts.find((x) => x.label === d.label)?.amount ?? 0), 0)} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}
