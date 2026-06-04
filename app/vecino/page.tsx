import { OwnerDashboard } from '@/components/dashboards/owner-dashboard'
import { requireProfile } from '@/lib/auth'
import { getOwnerDashboardData } from '@/lib/data'

export default async function VecinoPage() {
  const { profile } = await requireProfile(['vecino', 'super_admin'])
  const data = await getOwnerDashboardData(profile.id)

  if (!data) {
    return (
      <div className="min-h-screen bg-background pt-20">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="glass-card rounded-3xl p-8 text-center">
            <h1 className="font-serif text-2xl font-bold text-foreground">Panel vecino no disponible</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              La cuenta existe, pero todavía no tiene unidades asociadas como vecino principal.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pt-16">
      <OwnerDashboard data={data} />
    </div>
  )
}
