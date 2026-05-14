import { notFound } from 'next/navigation'
import { ReconciliationWizard } from '@/components/admin-backoffice/consorcio/reconciliation-wizard'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminCashAccounts, getIAdminConsorcioDetail } from '@/lib/data'

export default async function ConciliacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireIAdmin({ capability: 'collections.register' })

  const detail = await getIAdminConsorcioDetail(id)
  if (!detail) notFound()

  const cashAccounts = await getIAdminCashAccounts(id)

  return (
    <div className="space-y-6">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Conciliación</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">
          Subir extracto bancario
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Subi el extracto de tu banco (Excel o CSV) y te sugerimos con qué vecino o proveedor matchear cada
          movimiento. Revisás, aprobás y se aplican las cobranzas y pagos en una sola tanda.
        </p>
      </header>

      <ReconciliationWizard
        administrationId={detail.property.administrationId}
        propertyId={id}
        cashAccounts={cashAccounts}
      />
    </div>
  )
}
