import { Money } from '@/components/admin-backoffice/shared/money'
import type { IAdminCollectionsKpis } from '@/lib/types'

interface Props {
  kpis: IAdminCollectionsKpis
}

export function CobranzasOverview({ kpis }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <KpiCard
        label="Cobrado este mes"
        value={<Money amount={kpis.collectedThisMonth} />}
        accent="emerald"
        sub={`${kpis.paymentsThisMonth} pago${kpis.paymentsThisMonth === 1 ? '' : 's'} registrado${kpis.paymentsThisMonth === 1 ? '' : 's'}`}
      />
      <KpiCard
        label="Saldo abierto"
        value={<Money amount={kpis.openBalanceTotal} />}
        accent="sky"
        sub="Liquidaciones emitidas con saldo > 0"
      />
      <KpiCard
        label="Mora > 30 días"
        value={<Money amount={kpis.overdueOver30d} />}
        accent={kpis.overdueOver30d > 0 ? 'rose' : 'muted'}
        sub="Vencimiento original superado"
      />
      <KpiCard
        label="Pagos del mes"
        value={<span className="tabular-nums text-foreground">{kpis.paymentsThisMonth}</span>}
        accent="muted"
        sub="Vivos (excluye anulados)"
      />
    </div>
  )
}

const ACCENT_TONES: Record<string, string> = {
  emerald: 'bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200/50 dark:border-emerald-400/20',
  sky: 'bg-sky-50 dark:bg-sky-500/5 border-sky-200/50 dark:border-sky-400/20',
  rose: 'bg-rose-50 dark:bg-rose-500/5 border-rose-200/50 dark:border-rose-400/20',
  muted: '',
}

function KpiCard({
  label,
  value,
  sub,
  accent = 'muted',
}: {
  label: string
  value: React.ReactNode
  sub?: string
  accent?: 'emerald' | 'sky' | 'rose' | 'muted'
}) {
  return (
    <div className={`glass-card rounded-2xl p-4 border ${ACCENT_TONES[accent]}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  )
}
