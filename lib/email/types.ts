export type EmailTemplateKey =
  | 'welcome'
  | 'password_reset'
  | 'security_alert'
  | 'announcement'

export interface EmailRecipient {
  email: string
  profileId?: string | null
  fullName?: string | null
}
