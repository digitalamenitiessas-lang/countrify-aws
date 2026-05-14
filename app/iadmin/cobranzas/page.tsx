import { requireIAdmin } from '@/lib/auth'

export default async function CobranzasPage() {
  await requireIAdmin({ capability: 'collections.view' })

  return (
    <div className="space-y-4">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Cobranzas</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Cobranzas y deuda</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conciliacion de pagos contra liquidaciones emitidas.
        </p>
      </header>
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        El modulo de cobranzas esta modelado (iadmin_payments + iadmin_bank_movements) y se desarrolla en la fase 4.
      </div>
    </div>
  )
}
