import { sendEmail as sendViaSes } from '@/lib/aws/ses'
import type { EmailRecipient, EmailTemplateKey } from '@/lib/email/types'

interface SendInput {
  templateKey: EmailTemplateKey
  to: EmailRecipient
  subject: string
  html: string
  text: string
  metadata?: Record<string, unknown>
  replyTo?: string
}

interface SendResult {
  status: 'sent' | 'failed'
  reason?: string
  messageId?: string
}

export async function sendNotificationEmail(input: SendInput): Promise<SendResult> {
  const { templateKey, to, subject, html, text, replyTo } = input

  try {
    const messageId = await sendViaSes({
      to: to.email,
      subject,
      bodyText: text,
      bodyHtml: html,
      replyTo,
    })
    return { status: 'sent', messageId: messageId ?? undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[email/send] failed', { templateKey, to: to.email, error: message })
    return { status: 'failed', reason: message }
  }
}
