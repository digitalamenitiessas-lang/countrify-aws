// Tipos compartidos del modulo de email.

// Keys de preferencia: cada uno se mapea a una columna dentro de
// profiles.email_notifications. Los transaccionales no estan aca: siempre
// se mandan.
export type EmailPreferenceKey =
  | 'complaints'
  | 'liquidations'
  | 'announcements'
  | 'reminders'
  | 'promotions'

// Templates registrados. El template_key se guarda en email_events para que
// despues podamos filtrar por tipo. Los transaccionales fuerzan el envio
// (skipPreferences = true en SendEmailInput).
export type EmailTemplateKey =
  // Transaccionales (siempre se mandan):
  | 'welcome'
  | 'password_reset'
  | 'security_alert'
  // Por preferencia:
  | 'complaint_created'
  | 'complaint_message'
  | 'complaint_status_changed'
  | 'liquidation_issued'
  | 'liquidation_closed'
  | 'announcement'
  | 'reminder'
  | 'promotion_new'

export interface EmailRecipient {
  email: string
  profileId?: string | null
  fullName?: string | null
}

// Forma de un envio. Vivia en lib/aws/ses.ts, pero SES murio con la cuenta AWS
// y el tipo no tiene nada de especifico de SES: lo usan Resend y cualquier
// proveedor que se sume.
export interface SendEmailInput {
  to: string
  subject: string
  bodyText: string
  bodyHtml: string
  replyTo?: string
}
