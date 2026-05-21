export type EmailTemplateKey =
  | 'welcome'
  | 'password_reset'
  | 'security_alert'

export interface EmailRecipient {
  email: string
  profileId?: string | null
  fullName?: string | null
}
