import { renderEmailLayout, escapeHtml } from '@/lib/email/layout'

interface AnnouncementInput {
  recipientName: string
  buildingName: string
  authorName: string | null
  title: string
  body: string
  pinned: boolean
  deepLink: string
}

export function renderAnnouncementEmail(input: AnnouncementInput): {
  subject: string
  html: string
  text: string
} {
  // Preservamos saltos de linea del body convirtiendolos a <br/>. Si el
  // admin escribio con espaciado, queremos respetarlo en el mail.
  const bodyHtmlEscaped = escapeHtml(input.body).replace(/\n/g, '<br/>')

  const pinnedBadge = input.pinned
    ? `<div style="display:inline-block;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;background:#F04E23;color:#FFF;padding:2px 8px;border-radius:999px;font-weight:600;margin-bottom:10px;">Fijado</div>`
    : ''

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(input.recipientName)}</strong>,</p>
    <p style="margin:0 0 12px;color:#666;">
      ${input.authorName ? escapeHtml(input.authorName) + ' de ' : ''}la administración de
      <strong>${escapeHtml(input.buildingName)}</strong> publicó un comunicado:
    </p>
    <div style="margin:16px 0;padding:16px;background:#FFF6F2;border:1px solid #F2C9B8;border-radius:12px;">
      ${pinnedBadge}
      <div style="font-size:16px;font-weight:600;color:#1A1A1A;line-height:1.35;">${escapeHtml(input.title)}</div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #DDD;font-size:14px;color:#333;line-height:1.55;">
        ${bodyHtmlEscaped}
      </div>
    </div>
  `

  const { html, text } = renderEmailLayout({
    preheader: `${input.buildingName}: ${input.title}`,
    title: input.title,
    bodyHtml,
    ctaLabel: 'Ver en Countrify',
    ctaUrl: input.deepLink,
    footerNote: 'Podés desactivar estos mails desde Configuración → Notificaciones.',
  })

  return {
    subject: `${input.buildingName} · ${input.title}`,
    html,
    text,
  }
}
