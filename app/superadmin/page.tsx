import { SuperAdminDashboard } from '@/components/dashboards/superadmin-dashboard'
import { requireProfile } from '@/lib/auth'
import { getSuperAdminDashboardData } from '@/lib/data'

export default async function SuperAdminPage() {
  await requireProfile(['super_admin'])
  const data = await getSuperAdminDashboardData()

  return (
    <div className="min-h-screen bg-background pt-20">
      <SuperAdminDashboard data={data} />
    </div>
  )
}
