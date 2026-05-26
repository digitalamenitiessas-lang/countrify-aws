import { AnnouncementComposer } from '@/components/admin-backoffice/comunicaciones/announcement-composer'
import { PublishAnnouncementForm } from '@/components/admin-backoffice/comunicaciones/publish-announcement-form'
import { AnnouncementsHistory } from '@/components/admin-backoffice/comunicaciones/announcements-history'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminPortfolio } from '@/lib/data'
import { listAnnouncementsByAdminFromPostgres } from '@/lib/db/announcements'

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

  const [portfolio, announcementRows] = await Promise.all([
    getIAdminPortfolio(administrationId),
    listAnnouncementsByAdminFromPostgres({ administrationId }),
  ])

  const buildings = (portfolio?.properties ?? []).map((p) => ({
    id: p.buildingId,
    name: p.buildingName ?? p.displayName ?? 'Consorcio',
  }))

  const announcements = announcementRows.map((row) => ({
    id: row.id,
    buildingName: row.building_name,
    authorName: row.author_name,
    title: row.title,
    body: row.body,
    pinned: row.pinned,
    expiresAt: row.expires_at,
    publishedAt: row.published_at,
    readCount: row.read_count,
  }))

  return (
    <div className="space-y-6">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Comunicaciones</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Comunicados al consorcio</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Publicá un comunicado al feed de vecinos. Más abajo tenés el redactor con IA por si querés
          generar 3 versiones (cartelera, email, WhatsApp) antes de publicar.
        </p>
      </header>

      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Publicar nuevo comunicado</h2>
        <PublishAnnouncementForm buildings={buildings} />
      </section>

      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Historial</h2>
        <AnnouncementsHistory items={announcements} />
      </section>

      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-1">Redactor con IA (opcional)</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Contá de qué se trata y la IA genera 3 versiones: cartelera, email y WhatsApp. Después copiás
          la que quieras al form de "Publicar" arriba.
        </p>
        <AnnouncementComposer
          administrationId={administrationId}
          properties={(portfolio?.properties ?? []).map((p) => ({
            id: p.id,
            displayName: p.displayName,
            buildingName: p.buildingName,
          }))}
        />
      </section>
    </div>
  )
}
