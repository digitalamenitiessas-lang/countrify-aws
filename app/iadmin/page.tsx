import Link from 'next/link'
import { IAdminDashboard } from '@/components/admin-backoffice/home/iadmin-dashboard'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminPortfolioOverview } from '@/lib/data'

function parsePeriodParam(raw: string | undefined | null): { year: number; month: number } | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})$/.exec(raw)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (year < 2020 || year > 2100 || month < 1 || month > 12) return null
  return { year, month }
}

export const dynamic = 'force-dynamic'

export default async function IAdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const params = await searchParams
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

  const selectedPeriod = parsePeriodParam(params.period)
  const overview = await getIAdminPortfolioOverview(administrationId, selectedPeriod)

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
