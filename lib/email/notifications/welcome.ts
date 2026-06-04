import { sendNotificationEmail } from '@/lib/email/send'
import { renderWelcomeEmail } from '@/lib/email/templates/welcome'
import { pgQuery } from '@/lib/db/postgres'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://countrify.com.ar'

interface SendWelcomeInput {
  profileId: string
  // Si se omite, se busca en la DB por profileId. Pasarlo es opcional pero
  // ahorra una query cuando el caller ya lo tiene a mano.
  email?: string
  fullName?: string
  role?: string
  buildingId?: string | null
  businessId?: string | null
  // Si no se incluye, el mail no muestra el bloque de credenciales (caso
  // típico: usuario que ya existía y solo se le añadió un rol nuevo).
  temporaryPassword?: string
  // Marker para audit log + dedup. Si ya enviamos welcome a este profile
  // por este motivo, no lo repetimos.
  reason?:
    | 'platform_user_created'
    | 'neighbor_added'
    | 'bulk_imported'
    | 'business_admin_created'
}

// Envía mail de bienvenida. Es best-effort: nunca lanza, solo loguea — el
// caller no debería bloquear el alta del usuario por un fallo en SES.
export async function sendWelcomeEmail(input: SendWelcomeInput): Promise<void> {
  try {
    let email = input.email
    let fullName = input.fullName
    let role = input.role

    if (!email || !fullName || !role) {
      const res = await pgQuery<{ email: string; full_name: string; role: string }>(
        `select email, full_name, role from public.profiles where id = $1 limit 1`,
        [input.profileId],
      )
      const row = res.rows[0]
      if (!row) {
        console.warn('[email/welcome] profile not found', input.profileId)
        return
      }
      email = email ?? row.email
      fullName = fullName ?? row.full_name
      role = role ?? row.role
    }

    let buildingName: string | null = null
    if (input.buildingId) {
      const res = await pgQuery<{ name: string }>(
        `select name from public.buildings where id = $1 limit 1`,
        [input.buildingId],
      )
      buildingName = res.rows[0]?.name ?? null
    }

    let businessName: string | null = null
    if (input.businessId) {
      const res = await pgQuery<{ name: string }>(
        `select name from public.businesses where id = $1 limit 1`,
        [input.businessId],
      )
      businessName = res.rows[0]?.name ?? null
    }

    const tpl = renderWelcomeEmail({
      fullName: fullName!,
      email: email!,
      role: role!,
      buildingName,
      businessName,
      temporaryPassword: input.temporaryPassword,
      loginUrl: `${SITE_URL}/login`,
    })

    await sendNotificationEmail({
      templateKey: 'welcome',
      to: { email: email!, profileId: input.profileId, fullName: fullName! },
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      // Dedup por profile + reason: si ya mandamos welcome a este user por
      // esta razón, no lo repetimos (importante para reintento de bulk import).
      idempotencyKey: `welcome:${input.profileId}:${input.reason ?? 'default'}`,
      metadata: { reason: input.reason },
    })
  } catch (err) {
    console.error('[email/welcome] failed (non-blocking)', err)
  }
}
