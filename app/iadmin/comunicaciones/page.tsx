import { AnnouncementComposer } from '@/components/admin-backoffice/comunicaciones/announcement-composer'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminPortfolio } from '@/lib/data'

export default async function ComunicacionesPage() {
  const { context } = await requireIAdmin({ capability: 'communications.send' })

  const administrationId = context.primary?.administration.id
  if (!administrationId) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        Tu cuenta no tiene una administracion asignada todavia.
      </div>
    )
  }

  const portfolio = await getIAdminPortfolio(administrationId)

  return (
    <div className="space-y-6">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Comunicaciones</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Redactor con IA</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Contá de qué se trata el comunicado y la IA te genera 3 versiones: cartelera formal, email y WhatsApp.
          Editá, copiá y enviá por tu canal habitual.
        </p>
      </header>

      <AnnouncementComposer
        administrationId={administrationId}
        properties={(portfolio?.properties ?? []).map((p) => ({
          id: p.id,
          displayName: p.displayName,
          buildingName: p.buildingName,
        }))}
      />
    </div>
  )
}
