import { renderEmailLayout, escapeHtml } from '@/lib/email/layout'

interface PasswordResetInput {
  fullName: string
  resetUrl: string
  expiresHours: number
  requestedIp?: string | null
}

export function renderPasswordResetEmail(input: PasswordResetInput): {
  subject: string
  html: string
  text: string
} {
  const bodyHtml = `
    <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(input.fullName)}</strong>,</p>
    <p style="margin:0 0 12px;">Recibimos un pedido para restablecer la contraseña de tu cuenta. Si fuiste vos, hacé click en el botón de abajo. El link expira en ${input.expiresHours} horas y solo puede usarse una vez.</p>
    ${input.requestedIp ? `<p style="margin:8px 0 0;font-size:13px;color:#666;">Solicitud iniciada desde la IP <code>${escapeHtml(input.requestedIp)}</code>.</p>` : ''}
    <p style="margin:20px 0 0;font-size:14px;color:#666;">Si no pediste esto, ignorá este mail. Tu contraseña actual sigue funcionando.</p>
  `

  const { html, text } = renderEmailLayout({
    preheader: 'Restablecé tu contraseña de Countrify',
    title: 'Restablecer contraseña',
    bodyHtml,
    ctaLabel: 'Crear nueva contraseña',
    ctaUrl: input.resetUrl,
    footerNote: 'Por seguridad, nunca compartas este link con nadie.',
  })

  return {
    subject: 'Restablecé tu contraseña de Countrify',
    html,
    text,
  }
}
