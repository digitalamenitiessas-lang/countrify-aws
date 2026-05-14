import { ProvidersManager } from '@/components/admin-backoffice/providers/providers-manager'
import { can, requireIAdmin } from '@/lib/auth'
import { getIAdminProviders } from '@/lib/data'

export default async function ProveedoresPage() {
  const { context } = await requireIAdmin({ capability: 'expenses.view' })

  const administrationId = context.primary?.administration.id
  if (!administrationId) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        Tu cuenta no tiene una administracion asignada todavia.
      </div>
    )
  }

  const providers = await getIAdminProviders(administrationId)
  const canManage = can(context, 'providers.manage', { administrationId })

  return (
    <div className="space-y-6">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Catalogo</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Proveedores</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Catalogo unico por administracion. Se consume desde la carga de gastos.
        </p>
      </header>

      <ProvidersManager
        administrationId={administrationId}
        providers={providers}
        canManage={canManage}
      />
    </div>
  )
}
