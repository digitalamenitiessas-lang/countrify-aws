import { ConsorciosListView } from '@/components/superadmin/consorcios-list-view'
import { getSuperAdminDashboardData } from '@/lib/data'

export default async function ConsorciosPage() {
  const data = await getSuperAdminDashboardData()
  return <ConsorciosListView buildings={data.buildings} />
}
