import { SetupNotice } from '@/components/setup-notice'
import { BusinessDashboard } from '@/components/dashboards/business-dashboard'
import { requireProfile } from '@/lib/auth'
import { getBusinessDashboardData } from '@/lib/data'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export default async function AdminPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-background pt-16">
        <SetupNotice />
      </div>
    )
  }

  const { profile } = await requireProfile(['negocio_admin', 'super_admin'])
  const data = await getBusinessDashboardData(profile.id)

  return (
    <div className="min-h-screen bg-background pt-20">
      <BusinessDashboard initialData={data} profileId={profile.id} />
    </div>
  )
}

