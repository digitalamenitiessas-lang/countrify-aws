import { Resend } from 'resend'
import type { SendEmailInput } from '@/lib/aws/ses'

// Adaptador de Resend. Implementa la MISMA firma que lib/aws/ses.ts#sendEmail
// para que lib/email/send.ts (sendNotificationEmail) no tenga que cambiar.
//
// Variables de entorno:
//   RESEND_API_KEY        -> API key del dashboard de Resend (requerida).
//   RESEND_FROM_ADDRESS   -> From verificado, ej "Countrify <noreply@countrify.com.ar>".
//                            Default cae a EMAIL_FROM_ADDRESS / SES_FROM_ADDRESS.
//
// El dominio (countrify.com.ar) tiene que estar verificado en Resend con los
// registros DNS (SPF/DKIM) que el dashboard indica. Hasta que el dominio este
// verificado, Resend solo deja mandar a la cuenta dueña de la API key.

const RESEND_FROM_ADDRESS =
  process.env.RESEND_FROM_ADDRESS ??
  process.env.EMAIL_FROM_ADDRESS ??
  process.env.SES_FROM_ADDRESS ??
  'Countrify <noreply@countrify.com.ar>'

let cachedClient: Resend | null = null

function getResendClient(): Resend {
  if (!cachedClient) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error(
        'RESEND_API_KEY no esta seteada. Configurala en .env.local / el entorno para enviar mails con Resend.',
      )
    }
    cachedClient = new Resend(apiKey)
  }
  return cachedClient
}

export async function sendEmail({
  to,
  subject,
  bodyText,
  bodyHtml,
  replyTo,
}: SendEmailInput): Promise<{ messageId: string | undefined }> {
  const { data, error } = await getResendClient().emails.send({
    from: RESEND_FROM_ADDRESS,
    to: [to],
    subject,
    text: bodyText,
    html: bodyHtml,
    replyTo: replyTo ? [replyTo] : undefined,
  })

  if (error) {
    // Normalizamos a Error para que sendNotificationEmail lo capture y registre
    // status='failed' en email_events con el mensaje.
    throw new Error(`resend: ${error.name ?? 'error'} - ${error.message ?? 'unknown'}`)
  }

  return { messageId: data?.id }
}
