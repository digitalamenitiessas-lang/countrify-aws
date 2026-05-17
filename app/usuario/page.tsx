import { ConsumerDashboard } from '@/components/dashboards/consumer-dashboard'
import { requireProfile } from '@/lib/auth'
import { getConsumerDashboardData } from '@/lib/data'

export default async function UsuarioPage() {
  const { profile } = await requireProfile(['vecino', 'super_admin'])
  const data = await getConsumerDashboardData(profile.id)

  return (
    <div className="min-h-screen bg-background pt-16">
      <ConsumerDashboard initialData={data} profileId={profile.id} profileName={profile.fullName} avatarText={profile.avatarText} />
    </div>
  )
}
