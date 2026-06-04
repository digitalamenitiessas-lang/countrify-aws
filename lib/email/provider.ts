import { sendEmail as sendViaSes, type SendEmailInput } from '@/lib/aws/ses'
import { sendEmail as sendViaResend } from '@/lib/email/resend'

// Selector de proveedor de mail. Centraliza la decision SES vs Resend para que
// sendNotificationEmail (lib/email/send.ts) no la conozca.
//
//   EMAIL_PROVIDER = 'resend' | 'ses'
//     * Si esta seteada, manda.
//     * Si no esta seteada: usa Resend cuando hay RESEND_API_KEY, si no SES.
//
// AWS nos dejo SES en sandbox (no aprobaron produccion), por eso el default
// real es Resend en cuanto haya API key.

type Provider = 'resend' | 'ses'

function resolveProvider(): Provider {
  const explicit = process.env.EMAIL_PROVIDER?.toLowerCase()
  if (explicit === 'resend' || explicit === 'ses') return explicit
  return process.env.RESEND_API_KEY ? 'resend' : 'ses'
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<{ messageId: string | undefined }> {
  const provider = resolveProvider()
  return provider === 'resend' ? sendViaResend(input) : sendViaSes(input)
}
