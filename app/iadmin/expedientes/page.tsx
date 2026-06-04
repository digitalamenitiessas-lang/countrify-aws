import { ConsorcioCasesPanel } from '@/components/complaints/consorcio-cases-panel'
import { requireIAdmin } from '@/lib/auth'
import { getConsorcioDashboardData, getConsorcioDashboardDataByAdministration } from '@/lib/data'

export const dynamic = 'force-dynamic'

export default async function ExpedientesPage() {
  const { context, profile } = await requireIAdmin({ capability: 'consorcio.view' })

  // Patrón consistente con el resto del iadmin: si hay administración primaria, derivar
  // los edificios desde ahí. Si no (super_admin sin administración explícita), caer al
  // viejo flujo basado en assignments del perfil.
  const administrationId = context.primary?.administration.id ?? null
  const data = administrationId
    ? await getConsorcioDashboardDataByAdministration(administrationId)
    : await getConsorcioDashboardData(profile.id)

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Reclamos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reclamos y consultas de los vecinos de tus edificios.
        </p>
      </header>
      <ConsorcioCasesPanel data={data} />
    </div>
  )
}
