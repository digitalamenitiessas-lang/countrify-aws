import { renderEmailLayout, escapeHtml } from '@/lib/email/layout'

const ROLE_LABELS: Record<string, string> = {
  vecino: 'vecino',
  consorcio_admin: 'administrador del consorcio',
  negocio_admin: 'administrador de negocio',
  super_admin: 'super administrador',
}

interface WelcomeInput {
  fullName: string
  email: string
  temporaryPassword?: string
  role: string
  buildingName?: string | null
  businessName?: string | null
  loginUrl: string
}

export function renderWelcomeEmail(input: WelcomeInput): {
  subject: string
  html: string
  text: string
} {
  const roleLabel = ROLE_LABELS[input.role] ?? 'usuario'
  const contextLine = input.buildingName
    ? `Te dieron de alta como ${escapeHtml(roleLabel)} en <strong>${escapeHtml(input.buildingName)}</strong>.`
    : input.businessName
    ? `Te dieron de alta como ${escapeHtml(roleLabel)} en <strong>${escapeHtml(input.businessName)}</strong>.`
    : `Tu cuenta en Countrify quedó activa con rol de <strong>${escapeHtml(roleLabel)}</strong>.`

  const credentialsBlock = input.temporaryPassword
    ? `
      <div style="margin:20px 0;padding:16px;background:#FFF6F2;border:1px solid #F2C9B8;border-radius:10px;">
        <div style="font-size:13px;color:#666;margin-bottom:6px;">Tus credenciales de acceso</div>
        <div style="font-size:14px;line-height:1.6;">
          <strong>Email:</strong> ${escapeHtml(input.email)}<br/>
          <strong>Contraseña temporal:</strong> <code style="background:#fff;padding:2px 6px;border-radius:4px;border:1px solid #ddd;">${escapeHtml(input.temporaryPassword)}</code>
        </div>
        <div style="font-size:12px;color:#888;margin-top:10px;">Te recomendamos cambiarla apenas ingreses por primera vez.</div>
      </div>`
    : `
      <p style="margin:16px 0;">Usá tu email <strong>${escapeHtml(input.email)}</strong> para ingresar.</p>`

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(input.fullName)}</strong>,</p>
    <p style="margin:0 0 12px;">${contextLine}</p>
    ${credentialsBlock}
    <p style="margin:16px 0 0;color:#666;font-size:14px;">Si no esperabas este mail, podés ignorarlo — sin acceso a este link nadie puede entrar a tu cuenta.</p>
  `

  const { html, text } = renderEmailLayout({
    preheader: input.temporaryPassword
      ? 'Tu cuenta Countrify está lista. Adentro están tus credenciales.'
      : 'Tu cuenta Countrify está lista.',
    title: '¡Bienvenido/a a Countrify!',
    intro: input.buildingName
      ? `Te sumaron a ${input.buildingName} en Countrify.`
      : input.businessName
      ? `Sumaron tu negocio ${input.businessName} a Countrify.`
      : 'Tu cuenta acaba de activarse.',
    bodyHtml,
    ctaLabel: 'Ingresar a Countrify',
    ctaUrl: input.loginUrl,
    footerNote: input.temporaryPassword
      ? 'Por seguridad, cambiá tu contraseña apenas ingreses desde Configuración.'
      : undefined,
  })

  return {
    subject: input.buildingName
      ? `Bienvenido/a a ${input.buildingName} en Countrify`
      : input.businessName
      ? `Tu negocio ${input.businessName} ya está en Countrify`
      : 'Tu cuenta Countrify está lista',
    html,
    text,
  }
}
