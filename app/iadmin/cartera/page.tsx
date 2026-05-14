import { PortfolioOverview } from '@/components/admin-backoffice/cartera/portfolio-overview'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminPortfolio, getIAdminPortfolioOverview } from '@/lib/data'

export default async function CarteraPage() {
  const { context } = await requireIAdmin({ capability: 'portfolio.view' })

  const administrationId = context.primary?.administration.id
  if (!administrationId) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        Tu cuenta no tiene una administracion asignada todavia.
      </div>
    )
  }

  const [portfolio, overview] = await Promise.all([
    getIAdminPortfolio(administrationId),
    getIAdminPortfolioOverview(administrationId),
  ])

  if (!portfolio) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        No se pudo cargar la cartera.
      </div>
    )
  }

  return <PortfolioOverview portfolio={portfolio} overview={overview} />
}
