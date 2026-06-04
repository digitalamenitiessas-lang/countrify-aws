// Wrapper HTML compartido por todos los mails transaccionales y de
// notificacion. Branding Countrify (naranja + neutros). Inline-styles porque
// los clientes de mail no soportan <style> consistentemente.

interface LayoutInput {
  preheader?: string // texto oculto en la lista de inbox (sneak peek)
  title: string
  intro?: string // parrafo opcional debajo del title
  bodyHtml: string // el contenido especifico ya escapado
  ctaLabel?: string
  ctaUrl?: string
  footerNote?: string // copy adicional debajo del CTA
  unsubscribeUrl?: string // si esta presente, se muestra "Cancelar suscripcion"
}

const ORANGE = '#F04E23'
const DARK = '#1A1A1A'
const MUTED = '#666666'
const BORDER = '#E5E5E5'
const BG = '#FAFAFA'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://countrify.com.ar'

export function renderEmailLayout(input: LayoutInput): { html: string; text: string } {
  const {
    preheader,
    title,
    intro,
    bodyHtml,
    ctaLabel,
    ctaUrl,
    footerNote,
    unsubscribeUrl,
  } = input

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${DARK};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BG};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;width:100%;background:#FFFFFF;border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:24px 28px 8px;border-bottom:1px solid ${BORDER};">
            <a href="${escapeHtml(SITE_URL)}" style="text-decoration:none;color:${DARK};font-weight:700;font-size:18px;letter-spacing:-0.01em;">
              <span style="color:${ORANGE};">●</span> Countrify
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${DARK};font-weight:700;">${escapeHtml(title)}</h1>
            ${intro ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${MUTED};">${escapeHtml(intro)}</p>` : ''}
            <div style="font-size:15px;line-height:1.55;color:${DARK};">
              ${bodyHtml}
            </div>
            ${ctaLabel && ctaUrl ? `
            <div style="margin:28px 0 4px;">
              <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${ORANGE};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">
                ${escapeHtml(ctaLabel)}
              </a>
            </div>` : ''}
            ${footerNote ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(footerNote)}</p>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;background:#FAFAFA;border-top:1px solid ${BORDER};font-size:12px;color:${MUTED};line-height:1.5;">
            <div>Countrify · <a href="${escapeHtml(SITE_URL)}" style="color:${MUTED};">${escapeHtml(stripProtocol(SITE_URL))}</a></div>
            ${unsubscribeUrl ? `<div style="margin-top:6px;"><a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Cancelar este tipo de notificaciones</a></div>` : ''}
            <div style="margin-top:6px;color:#9A9A9A;">Este mail fue enviado a un usuario registrado. Si no esperabas recibirlo, ignoralo.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  // Plaintext fallback (no escapado porque es texto crudo)
  const text = [
    title,
    intro ? `\n${intro}` : '',
    `\n${stripTags(bodyHtml)}`,
    ctaLabel && ctaUrl ? `\n${ctaLabel}: ${ctaUrl}` : '',
    footerNote ? `\n\n${footerNote}` : '',
    `\n\n--\nCountrify · ${SITE_URL}`,
    unsubscribeUrl ? `\nCancelar este tipo de notificaciones: ${unsubscribeUrl}` : '',
  ]
    .filter(Boolean)
    .join('')

  return { html, text }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>(\n)?/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, '')
}
