import { BusinessDashboard } from '@/components/dashboards/business-dashboard'
import { requireProfile } from '@/lib/auth'
import { getBusinessDashboardData } from '@/lib/data'

export default async function AdminPage() {
  const { profile } = await requireProfile(['negocio_admin', 'super_admin'])
  const data = await getBusinessDashboardData(profile.id)

  return (
    <div className="min-h-screen bg-background pt-20">
      <BusinessDashboard initialData={data} profileId={profile.id} />
    </div>
  )
}
