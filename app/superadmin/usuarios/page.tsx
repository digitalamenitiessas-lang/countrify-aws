import { UsuariosView } from '@/components/superadmin/usuarios-view'
import { getSuperAdminDashboardData } from '@/lib/data'

export default async function UsuariosPage() {
  const data = await getSuperAdminDashboardData()
  return <UsuariosView users={data.users} buildings={data.buildings} businesses={data.businesses} />
}
