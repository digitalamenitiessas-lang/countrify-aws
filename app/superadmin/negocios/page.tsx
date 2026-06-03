import { NegociosView } from '@/components/superadmin/negocios-view'
import { getSuperAdminDashboardData } from '@/lib/data'

export default async function NegociosPage() {
  const data = await getSuperAdminDashboardData()
  return (
    <div>
      <div className="mb-6">
        <h2 className="font-bold text-foreground text-lg leading-tight">Negocios</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{data.businesses.length} negocios afiliados</p>
      </div>
      <NegociosView businesses={data.businesses} />
    </div>
  )
}
