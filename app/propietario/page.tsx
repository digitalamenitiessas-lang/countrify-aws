import { SetupNotice } from '@/components/setup-notice'
import { OwnerDashboard } from '@/components/dashboards/owner-dashboard'
import { requireProfile } from '@/lib/auth'
import { getOwnerDashboardData } from '@/lib/data'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export default async function PropietarioPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-background pt-16">
        <SetupNotice />
      </div>
    )
  }

  const { profile } = await requireProfile(['propietario', 'super_admin'])
  const data = await getOwnerDashboardData(profile.id)

  if (!data) {
    return (
      <div className="min-h-screen bg-background pt-20">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="glass-card rounded-3xl p-8 text-center">
            <h1 className="font-serif text-2xl font-bold text-foreground">Perfil propietario no disponible</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              La cuenta existe, pero todavia no tiene unidades asociadas como propietario.
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
