import { requireIAdmin, can } from '@/lib/auth'
import { CapabilityGate } from '@/components/admin-backoffice/shared/capability-gate'

export default async function ReportesPage() {
  const { context } = await requireIAdmin({ capability: 'reports.view' })

  return (
    <div className="space-y-4">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Reportes</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Indicadores operativos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reportes financieros, ocupacion y morosidad. Algunos requieren capacidad sensible.
        </p>
      </header>

      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        Reportes operativos basicos llegan en la fase 5.
      </div>

      <CapabilityGate
        context={context}
        need="reports.sensitive.view"
        fallback={
          <div className="glass-card rounded-2xl p-6 text-xs text-muted-foreground">
            Tu rol no incluye reportes financieros sensibles.
          </div>
        }
      >
        <div className="glass-card rounded-2xl p-6 text-sm text-foreground">
          Espacio reservado para reportes financieros sensibles (rendiciones, deuda agregada, fee).
        </div>
      </CapabilityGate>
    </div>
  )
}
