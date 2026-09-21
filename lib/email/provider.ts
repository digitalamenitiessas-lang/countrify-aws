import type { SendEmailInput } from '@/lib/email/types'
import { sendEmail as sendViaResend } from '@/lib/email/resend'

// Selector de proveedor de mail. Centraliza la decision SES vs Resend para que
// sendNotificationEmail (lib/email/send.ts) no la conozca.
//
// Unico proveedor: Resend.
//
// Antes habia un fallback a SES, pero la cuenta AWS se borro: ese camino no
// puede funcionar, y "fallback a algo que siempre falla" es peor que no tener
// fallback, porque el error aparece lejos de la causa. Si algun dia se suma
// otro proveedor, se agrega aca.

type Provider = 'resend'

function resolveProvider(): Provider {
  const explicit = process.env.EMAIL_PROVIDER?.toLowerCase()
  if (explicit && explicit !== 'resend') {
    throw new Error(
      `EMAIL_PROVIDER='${explicit}' no existe. El unico proveedor es 'resend' (SES se fue con la cuenta AWS).`,
    )
  }
  return 'resend'
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<{ messageId: string | undefined }> {
  // resolveProvider() tira si EMAIL_PROVIDER trae cualquier otra cosa, asi que
  // aca solo queda Resend. Se deja la llamada para que la validacion corra.
  resolveProvider()
  return sendViaResend(input)
}
