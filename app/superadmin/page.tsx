import { SetupNotice } from '@/components/setup-notice'
import { SuperAdminDashboard } from '@/components/dashboards/superadmin-dashboard'
import { requireProfile } from '@/lib/auth'
import { getSuperAdminDashboardData } from '@/lib/data'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export default async function SuperAdminPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-background pt-16">
        <SetupNotice />
      </div>
    )
  }

  await requireProfile(['super_admin'])
  const data = await getSuperAdminDashboardData()

  return (
    <div className="min-h-screen bg-background pt-20">
      <SuperAdminDashboard data={data} />
    </div>
  )
}

