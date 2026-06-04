import {
  getAnnouncementForEmailFromPostgres,
  listAnnouncementRecipientsFromPostgres,
} from '@/lib/db/announcements'
import { sendNotificationEmail } from '@/lib/email/send'
import { renderAnnouncementEmail } from '@/lib/email/templates/announcement'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://countrify.com.ar'

function deepLinkForRole(role: string, announcementId: string): string {
  if (role === 'consorcio_admin' || role === 'super_admin') {
    return `${SITE_URL}/iadmin/comunicaciones?id=${encodeURIComponent(announcementId)}`
  }
  return `${SITE_URL}/usuario?view=announcements&id=${encodeURIComponent(announcementId)}`
}

// notifyAnnouncementPublished: dispara mail a todos los vecinos +
// propietarios del building que tengan la preference 'announcements'
// activa y no esten email_blocked. Best-effort: errores capturados
// adentro para no bloquear el publish action.
export async function notifyAnnouncementPublished(announcementId: string): Promise<void> {
  try {
    const ann = await getAnnouncementForEmailFromPostgres(announcementId)
    if (!ann) return
    if (!ann.building_name) return

    const recipients = await listAnnouncementRecipientsFromPostgres({
      buildingId: ann.building_id,
    })
    if (recipients.length === 0) return

    for (const r of recipients) {
      const tpl = renderAnnouncementEmail({
        recipientName: r.full_name,
        buildingName: ann.building_name,
        authorName: ann.author_name,
        title: ann.title,
        body: ann.body,
        pinned: ann.pinned,
        deepLink: deepLinkForRole(r.role, ann.id),
      })
      await sendNotificationEmail({
        templateKey: 'announcement',
        to: { email: r.email, profileId: r.profile_id, fullName: r.full_name },
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        preferenceKey: 'announcements',
        // Dedup por (announcementId, recipient). Si el admin re-publica
        // editando el comunicado, el helper se llama otra vez pero los
        // recipients que ya lo recibieron quedan dedupados. Si el admin
        // quiere re-enviar despues de editar, podemos exponer un boton
        // explicito "reenviar" mas adelante.
        idempotencyKey: `announcement:${announcementId}:${r.profile_id}`,
        metadata: { announcementId, buildingId: ann.building_id },
      })
    }
  } catch (err) {
    console.error('[email/notifyAnnouncementPublished] failed (non-blocking)', err)
  }
}
