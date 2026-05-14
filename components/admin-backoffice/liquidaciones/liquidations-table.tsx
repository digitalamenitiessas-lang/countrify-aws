import Link from 'next/link'
import type { IAdminLiquidationRunSummary, IAdminLiquidationStatus } from '@/lib/types'
import { Money } from '@/components/admin-backoffice/shared/money'

const STATUS_LABELS: Record<IAdminLiquidationStatus, string> = {
  draft: 'Borrador',
  calculated: 'Calculada',
  issued: 'Emitida',
  closed: 'Cerrada',
}

const STATUS_TONE: Record<IAdminLiquidationStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  calculated: 'bg-amber-100 text-amber-800',
  issued: 'bg-sky-100 text-sky-800',
  closed: 'bg-emerald-100 text-emerald-800',
}

export function LiquidationsTable({ runs }: { runs: IAdminLiquidationRunSummary[] }) {
  if (runs.length === 0) {
    return (
      <div className="glass-card rounded-2xl px-5 py-12 text-center text-sm text-muted-foreground">
        Aun no hay corridas de liquidacion. Generar la primera desde un consorcio con periodo abierto.
      </div>
    )
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
            <th className="text-left px-5 py-3 font-medium">Consorcio</th>
            <th className="text-left px-5 py-3 font-medium">Periodo</th>
            <th className="text-left px-5 py-3 font-medium">Estado</th>
            <th className="text-right px-5 py-3 font-medium">Unidades</th>
            <th className="text-right px-5 py-3 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-b border-border/30 last:border-0 hover:bg-muted/40">
              <td className="px-5 py-3">
                <Link href={`/iadmin/liquidaciones/${run.id}`} className="font-medium text-foreground hover:text-primary">
                  {run.managedPropertyName}
                </Link>
              </td>
              <td className="px-5 py-3 text-muted-foreground tabular-nums">
                {String(run.periodMonth).padStart(2, '0')}/{run.periodYear}
              </td>
              <td className="px-5 py-3">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[run.status]}`}>
                  {STATUS_LABELS[run.status]}
                </span>
              </td>
              <td className="px-5 py-3 text-right tabular-nums text-foreground">{run.totalUnits}</td>
              <td className="px-5 py-3 text-right tabular-nums text-foreground">
                <Money amount={run.totalExpenses} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
