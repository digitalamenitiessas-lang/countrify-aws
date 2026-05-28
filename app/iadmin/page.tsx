import Link from 'next/link'
import { IAdminDashboard } from '@/components/admin-backoffice/home/iadmin-dashboard'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminPortfolioOverview } from '@/lib/data'

export default async function IAdminHomePage() {
  const { context, profile } = await requireIAdmin({ capability: 'portfolio.view' })

  const administrationId = context.primary?.administration.id
  if (!administrationId) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        Tu cuenta no tiene una administración asignada todavía. Pedile al super admin que te
        vincule a una para empezar.
      </div>
    )
  }

  const overview = await getIAdminPortfolioOverview(administrationId)

  if (!overview) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        No se pudo cargar el resumen.{' '}
        <Link href="/iadmin/cartera" className="text-primary hover:underline">
          Ir a Cartera
        </Link>
        .
      </div>
    )
  }

  return (
    <IAdminDashboard
      overview={overview}
      administratorName={profile.fullName ?? ''}
    />
  )
}
