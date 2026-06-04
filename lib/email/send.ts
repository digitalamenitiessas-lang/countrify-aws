import { sendEmail as sendViaProvider } from '@/lib/email/provider'
import { pgQuery } from '@/lib/db/postgres'
import type {
  EmailPreferenceKey,
  EmailRecipient,
  EmailTemplateKey,
} from '@/lib/email/types'

interface SendInput {
  templateKey: EmailTemplateKey
  to: EmailRecipient
  subject: string
  html: string
  text: string
  // Si esta seteado, una preference key que el profile puede haber deshabilitado.
  // No aplica a templates transaccionales (welcome, password_reset, etc.).
  preferenceKey?: EmailPreferenceKey
  // Si se manda dos veces el mismo idempotencyKey, el segundo se ignora.
  // Util para no spammear (ej. status change disparado dos veces por race).
  idempotencyKey?: string
  // Metadata libre que se guarda en email_events.metadata para debugging.
  metadata?: Record<string, unknown>
  // Reply-to opcional (default: noreply@countrify.com.ar configurado en SES).
  replyTo?: string
}

interface SendResult {
  status: 'sent' | 'suppressed' | 'duplicate' | 'failed'
  reason?: string
  messageId?: string
  eventId?: string
}

// Devuelve true si el profile NO bloquea este template.
//   * Si profile no existe o no se conoce, no aplicamos preferencias (asumimos
//     que el caller sabe lo que hace — por ejemplo welcome a un usuario recien
//     creado donde todavia no se cargo el row entero).
//   * email_blocked siempre suprime, sin importar la preferencia.
async function checkProfileAllowsSend(
  profileId: string | null | undefined,
  preferenceKey: EmailPreferenceKey | undefined,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (!profileId) return { allowed: true }

  const res = await pgQuery<{
    email_blocked: boolean
    email_blocked_reason: string | null
    email_notifications: Record<string, boolean>
  }>(
    `select email_blocked, email_blocked_reason, email_notifications
       from public.profiles where id = $1 limit 1`,
    [profileId],
  )
  const row = res.rows[0]
  if (!row) return { allowed: true }

  if (row.email_blocked) {
    return {
      allowed: false,
      reason: `profile.email_blocked (${row.email_blocked_reason ?? 'unknown'})`,
    }
  }

  if (preferenceKey && row.email_notifications?.[preferenceKey] === false) {
    return { allowed: false, reason: `profile.email_notifications.${preferenceKey} = false` }
  }

  return { allowed: true }
}

// Si ya existe un email_events con el mismo idempotency_key, devuelve el row.
async function findExistingByIdempotency(idempotencyKey: string) {
  const res = await pgQuery<{ id: string; ses_message_id: string | null }>(
    `select id, ses_message_id from public.email_events where idempotency_key = $1 limit 1`,
    [idempotencyKey],
  )
  return res.rows[0] ?? null
}

async function recordEvent(input: {
  templateKey: EmailTemplateKey
  to: EmailRecipient
  subject: string
  idempotencyKey?: string
  metadata?: Record<string, unknown>
  status: 'sent' | 'suppressed' | 'failed'
  sesMessageId?: string
  error?: string
}): Promise<string> {
  const res = await pgQuery<{ id: string }>(
    `insert into public.email_events
       (template_key, to_email, to_profile_id, subject, idempotency_key,
        status, ses_message_id, error, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::jsonb, '{}'::jsonb))
     returning id`,
    [
      input.templateKey,
      input.to.email,
      input.to.profileId ?? null,
      input.subject,
      input.idempotencyKey ?? null,
      input.status,
      input.sesMessageId ?? null,
      input.error ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  )
  return res.rows[0].id
}

// Punto de entrada unico para enviar mails desde el backend. Encapsula:
//   * dedup por idempotency_key
//   * preference check (toggles del profile)
//   * email_blocked check (bounces/complaints)
//   * audit log en email_events
//   * envio SES + captura de message_id
export async function sendNotificationEmail(input: SendInput): Promise<SendResult> {
  const {
    templateKey,
    to,
    subject,
    html,
    text,
    preferenceKey,
    idempotencyKey,
    metadata,
    replyTo,
  } = input

  // 1) Dedup
  if (idempotencyKey) {
    const existing = await findExistingByIdempotency(idempotencyKey)
    if (existing) {
      return {
        status: 'duplicate',
        eventId: existing.id,
        messageId: existing.ses_message_id ?? undefined,
      }
    }
  }

  // 2) Preference / bloqueo
  const check = await checkProfileAllowsSend(to.profileId, preferenceKey)
  if (!check.allowed) {
    const eventId = await recordEvent({
      templateKey,
      to,
      subject,
      idempotencyKey,
      metadata: { ...metadata, suppression_reason: check.reason },
      status: 'suppressed',
    })
    return { status: 'suppressed', reason: check.reason, eventId }
  }

  // 3) Envio
  try {
    const { messageId } = await sendViaProvider({
      to: to.email,
      subject,
      bodyText: text,
      bodyHtml: html,
      replyTo,
    })
    const eventId = await recordEvent({
      templateKey,
      to,
      subject,
      idempotencyKey,
      metadata,
      status: 'sent',
      sesMessageId: messageId,
    })
    return { status: 'sent', eventId, messageId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const eventId = await recordEvent({
      templateKey,
      to,
      subject,
      idempotencyKey,
      metadata,
      status: 'failed',
      error: message,
    })
    console.error('[email/send] failed', { templateKey, to: to.email, error: message })
    return { status: 'failed', reason: message, eventId }
  }
}
