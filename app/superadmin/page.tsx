import { InicioView } from '@/components/superadmin/inicio-view'
import { getSuperAdminDashboardData } from '@/lib/data'

export default async function SuperAdminPage() {
  const data = await getSuperAdminDashboardData()
  return <InicioView data={data} />
}
