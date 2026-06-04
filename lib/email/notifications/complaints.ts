import { pgQuery } from '@/lib/db/postgres'
import { sendNotificationEmail } from '@/lib/email/send'
import { renderComplaintCreatedEmail } from '@/lib/email/templates/complaint-created'
import { renderComplaintMessageEmail } from '@/lib/email/templates/complaint-message'
import { renderComplaintStatusChangedEmail } from '@/lib/email/templates/complaint-status-changed'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://countrify.com.ar'

// Construye el deep-link al expediente segun el rol del recipient. Vecino y
// propietario van a su panel; consorcio_admin y super_admin al backoffice.
function deepLinkForRole(role: string, caseId: string): string {
  if (role === 'consorcio_admin' || role === 'super_admin') {
    return `${SITE_URL}/iadmin/expedientes?caseId=${encodeURIComponent(caseId)}`
  }
  return `${SITE_URL}/usuario?view=complaints&caseId=${encodeURIComponent(caseId)}`
}

const ROLE_LABELS: Record<string, string> = {
  vecino: 'vecino',
  consorcio_admin: 'admin del consorcio',
  super_admin: 'super admin',
}

interface CaseContext {
  id: string
  case_code: string
  title: string
  status: string
  building_id: string
  building_name: string
  author_profile_id: string
  author_full_name: string
}

async function getCaseContext(caseId: string): Promise<CaseContext | null> {
  const res = await pgQuery<CaseContext>(
    `select
       c.id,
       c.case_code,
       c.title,
       c.status::text as status,
       c.building_id,
       b.name as building_name,
       c.author_profile_id,
       p.full_name as author_full_name
     from countrify.complaint_cases c
     join countrify.buildings b on b.id = c.building_id
     join countrify.profiles p on p.id = c.author_profile_id
     where c.id = $1
     limit 1`,
    [caseId],
  )
  return res.rows[0] ?? null
}

interface BuildingAdmin {
  profile_id: string
  email: string
  full_name: string
  role: string
}

// Admins asignados al edificio (consorcio_admin con grant en
// building_admin_assignments). Tambien super_admins (que igual ven todo)
// quedan FUERA del envio para no spammearlos por cada expediente.
async function getBuildingAdmins(buildingId: string): Promise<BuildingAdmin[]> {
  const res = await pgQuery<BuildingAdmin>(
    `select p.id as profile_id, p.email, p.full_name, p.role::text as role
       from countrify.building_admin_assignments baa
       join countrify.profiles p on p.id = baa.profile_id
      where baa.building_id = $1
        and p.role = 'consorcio_admin'`,
    [buildingId],
  )
  return res.rows
}

// notifyComplaintCreated: mail a los admins asignados al edificio del
// expediente. Idempotente por caseId — si por alguna razon se llamara dos
// veces, el segundo envio queda como duplicate.
export async function notifyComplaintCreated(caseId: string): Promise<void> {
  try {
    const ctx = await getCaseContext(caseId)
    if (!ctx) return
    const admins = await getBuildingAdmins(ctx.building_id)
    if (admins.length === 0) return

    for (const admin of admins) {
      const tpl = renderComplaintCreatedEmail({
        recipientName: admin.full_name,
        buildingName: ctx.building_name,
        caseCode: ctx.case_code,
        caseTitle: ctx.title,
        authorName: ctx.author_full_name,
        caseDeepLink: deepLinkForRole(admin.role, ctx.id),
      })
      await sendNotificationEmail({
        templateKey: 'complaint_created',
        to: { email: admin.email, profileId: admin.profile_id, fullName: admin.full_name },
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        preferenceKey: 'complaints',
        idempotencyKey: `complaint_created:${ctx.id}:${admin.profile_id}`,
        metadata: { caseId: ctx.id, buildingId: ctx.building_id },
      })
    }
  } catch (err) {
    // No bloqueamos la creacion del expediente si falla el envio.
    console.error('[email/notifyComplaintCreated] failed (non-blocking)', err)
  }
}

interface MessageContext {
  id: string
  case_id: string
  author_profile_id: string
  author_full_name: string
  author_role: string
  message: string
  message_type: string
  created_at: string
}

// notifyComplaintMessage: mail al autor del expediente + admins del edificio
// + mencionados explicitos. Excluye al autor del mensaje. Cada destinatario
// recibe a lo sumo UN mail por mensaje (dedup por messageId:recipient).
export async function notifyComplaintMessage(messageId: string): Promise<void> {
  try {
    const msgRes = await pgQuery<MessageContext>(
      `select m.id, m.case_id, m.author_profile_id,
              coalesce(p.full_name, 'Usuario') as author_full_name,
              coalesce(p.role::text, 'vecino') as author_role,
              m.message,
              m.message_type::text as message_type,
              m.created_at::text as created_at
         from countrify.complaint_case_messages m
         left join countrify.profiles p on p.id = m.author_profile_id
        where m.id = $1
        limit 1`,
      [messageId],
    )
    const msg = msgRes.rows[0]
    if (!msg) return

    const ctx = await getCaseContext(msg.case_id)
    if (!ctx) return

    // Recipients candidatos: autor del expediente + admins del edificio +
    // mencionados explicitos. Excluimos al autor del mensaje (no se
    // notifica a si mismo).
    type Candidate = { profileId: string; email: string; fullName: string; role: string; isMention: boolean }
    const candidates: Candidate[] = []

    // Autor del expediente
    if (msg.author_profile_id !== ctx.author_profile_id) {
      const authorRes = await pgQuery<{ email: string; full_name: string; role: string }>(
        `select email, full_name, role::text as role from countrify.profiles where id = $1 limit 1`,
        [ctx.author_profile_id],
      )
      const a = authorRes.rows[0]
      if (a) {
        candidates.push({
          profileId: ctx.author_profile_id,
          email: a.email,
          fullName: a.full_name,
          role: a.role,
          isMention: false,
        })
      }
    }

    // Admins del edificio (excepto si el mensaje lo escribio un admin del mismo)
    const admins = await getBuildingAdmins(ctx.building_id)
    for (const admin of admins) {
      if (admin.profile_id === msg.author_profile_id) continue
      if (candidates.some((c) => c.profileId === admin.profile_id)) continue
      candidates.push({
        profileId: admin.profile_id,
        email: admin.email,
        fullName: admin.full_name,
        role: admin.role,
        isMention: false,
      })
    }

    // Mencionados explicitos (marca isMention=true en su candidato; si ya
    // estaba, lo upgradeamos para que el mail tenga el copy de mencion).
    const mentionsRes = await pgQuery<{ profile_id: string; email: string; full_name: string; role: string }>(
      `select m.mentioned_profile_id as profile_id,
              p.email,
              p.full_name,
              p.role::text as role
         from countrify.complaint_case_message_mentions m
         join countrify.profiles p on p.id = m.mentioned_profile_id
        where m.message_id = $1`,
      [messageId],
    )
    for (const mention of mentionsRes.rows) {
      if (mention.profile_id === msg.author_profile_id) continue
      const existing = candidates.find((c) => c.profileId === mention.profile_id)
      if (existing) {
        existing.isMention = true
      } else {
        candidates.push({
          profileId: mention.profile_id,
          email: mention.email,
          fullName: mention.full_name,
          role: mention.role,
          isMention: true,
        })
      }
    }

    if (candidates.length === 0) return

    // Preview del mensaje truncado a ~280 chars para no inflar el mail.
    const preview = msg.message.length > 280 ? `${msg.message.slice(0, 280)}…` : msg.message

    for (const c of candidates) {
      const tpl = renderComplaintMessageEmail({
        recipientName: c.fullName,
        buildingName: ctx.building_name,
        caseCode: ctx.case_code,
        caseTitle: ctx.title,
        authorName: msg.author_full_name,
        authorRoleLabel: ROLE_LABELS[msg.author_role] ?? msg.author_role,
        messagePreview: preview,
        isMention: c.isMention,
        caseDeepLink: deepLinkForRole(c.role, ctx.id),
      })
      await sendNotificationEmail({
        templateKey: 'complaint_message',
        to: { email: c.email, profileId: c.profileId, fullName: c.fullName },
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        preferenceKey: 'complaints',
        idempotencyKey: `complaint_message:${messageId}:${c.profileId}`,
        metadata: { caseId: ctx.id, messageId, isMention: c.isMention },
      })
    }
  } catch (err) {
    console.error('[email/notifyComplaintMessage] failed (non-blocking)', err)
  }
}

// notifyComplaintStatusChanged: mail al autor del expediente cuando el
// admin cambia el estado.
export async function notifyComplaintStatusChanged(
  caseId: string,
  previousStatus: string,
  newStatus: string,
  changedByProfileId: string,
): Promise<void> {
  try {
    if (previousStatus === newStatus) return
    const ctx = await getCaseContext(caseId)
    if (!ctx) return

    // No notificamos al autor si el cambio lo hizo el mismo (caso raro pero
    // posible si el autor es super_admin).
    if (ctx.author_profile_id === changedByProfileId) return

    const authorRes = await pgQuery<{ email: string; full_name: string; role: string }>(
      `select email, full_name, role::text as role from countrify.profiles where id = $1 limit 1`,
      [ctx.author_profile_id],
    )
    const author = authorRes.rows[0]
    if (!author) return

    const changerRes = await pgQuery<{ full_name: string }>(
      `select full_name from countrify.profiles where id = $1 limit 1`,
      [changedByProfileId],
    )
    const changedByName = changerRes.rows[0]?.full_name ?? 'El administrador'

    const tpl = renderComplaintStatusChangedEmail({
      recipientName: author.full_name,
      buildingName: ctx.building_name,
      caseCode: ctx.case_code,
      caseTitle: ctx.title,
      previousStatus,
      newStatus,
      changedByName,
      caseDeepLink: deepLinkForRole(author.role, ctx.id),
    })
    await sendNotificationEmail({
      templateKey: 'complaint_status_changed',
      to: { email: author.email, profileId: ctx.author_profile_id, fullName: author.full_name },
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      preferenceKey: 'complaints',
      // Una transicion identica (mismo from/to) solo deberia notificarse una
      // vez. Si por alguna razon se reintenta, el segundo envio queda dedup.
      idempotencyKey: `complaint_status:${caseId}:${previousStatus}->${newStatus}`,
      metadata: { caseId, previousStatus, newStatus },
    })
  } catch (err) {
    console.error('[email/notifyComplaintStatusChanged] failed (non-blocking)', err)
  }
}
