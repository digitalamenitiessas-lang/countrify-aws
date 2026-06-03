import { ConsorcioWizardView } from '@/components/superadmin/consorcio-wizard-view'
import { getSuperAdminDashboardData } from '@/lib/data'

export default async function NuevoConsorcioPage() {
  const data = await getSuperAdminDashboardData()
  return (
    <div>
      <div className="mb-6">
        <h2 className="font-bold text-foreground text-lg leading-tight">Crear consorcio</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Alta llave en mano: country, administración, configuración y admin en un solo flujo. Al terminar, cargás el padrón de unidades.
        </p>
      </div>
      <ConsorcioWizardView consorcioAdmins={data.consorcioAdminOptions} />
    </div>
  )
}
