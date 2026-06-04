import { notFound } from 'next/navigation'
import { BulkUnitUsersWizard } from '@/components/admin-backoffice/consorcio/bulk-unit-users-wizard'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminConsorcioDetail } from '@/lib/data'

export default async function VecinosMasivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireIAdmin({ capability: 'holders.manage' })

  const detail = await getIAdminConsorcioDetail(id)
  if (!detail) notFound()

  return (
    <div className="space-y-6">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Carga masiva</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">
          Cargar vecinos pegando una tabla
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Copiá las columnas <strong>unidad, nombre, email, relación</strong> (y teléfono opcional) desde Excel o
          Google Sheets y pegalas acá. Previsualizá, corregí lo que haga falta y confirmá: los vecinos nuevos
          reciben su contraseña temporal por mail y la deben cambiar en el primer ingreso.
        </p>
      </header>

      <BulkUnitUsersWizard
        administrationId={detail.property.administrationId}
        propertyId={id}
        propertyName={detail.property.displayName ?? detail.property.buildingName}
      />
    </div>
  )
}
