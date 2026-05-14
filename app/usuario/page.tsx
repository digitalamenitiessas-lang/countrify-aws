import { SetupNotice } from '@/components/setup-notice'
import { ConsumerDashboard } from '@/components/dashboards/consumer-dashboard'
import { requireProfile } from '@/lib/auth'
import { getConsumerDashboardData } from '@/lib/data'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export default async function UsuarioPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-background pt-16">
        <SetupNotice />
      </div>
    )
  }

  const { profile } = await requireProfile(['vecino', 'super_admin'])
  const data = await getConsumerDashboardData(profile.id)

  return (
    <div className="min-h-screen bg-background pt-16">
      <ConsumerDashboard initialData={data} profileId={profile.id} profileName={profile.fullName} avatarText={profile.avatarText} />
    </div>
  )
}
