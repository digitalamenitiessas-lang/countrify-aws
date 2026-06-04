import { renderEmailLayout, escapeHtml } from '@/lib/email/layout'

interface ComplaintMessageInput {
  recipientName: string
  buildingName: string
  caseCode: string
  caseTitle: string
  authorName: string
  authorRoleLabel: string
  messagePreview: string // Primeras N palabras del mensaje (ya truncado)
  isMention: boolean // Si el recipient fue mencionado en el mensaje
  caseDeepLink: string
}

export function renderComplaintMessageEmail(input: ComplaintMessageInput): {
  subject: string
  html: string
  text: string
} {
  const headline = input.isMention
    ? `${input.authorName} te mencionó en un expediente`
    : `Nuevo mensaje en tu expediente ${input.caseCode}`

  const intro = input.isMention
    ? 'Alguien te mencionó en un comentario.'
    : 'Hay un comentario nuevo en un expediente del que participás.'

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(input.recipientName)}</strong>,</p>
    <div style="margin:16px 0;padding:14px;background:#F7F7F7;border:1px solid #E5E5E5;border-radius:10px;">
      <div style="font-size:12px;color:#666;letter-spacing:0.5px;text-transform:uppercase;">${escapeHtml(input.buildingName)} · ${escapeHtml(input.caseCode)}</div>
      <div style="font-size:14px;font-weight:600;color:#1A1A1A;margin-top:4px;">${escapeHtml(input.caseTitle)}</div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #DDD;">
        <div style="font-size:13px;color:#666;">${escapeHtml(input.authorName)} (${escapeHtml(input.authorRoleLabel)}) escribió:</div>
        <div style="font-size:14px;color:#1A1A1A;margin-top:6px;white-space:pre-line;">${escapeHtml(input.messagePreview)}</div>
      </div>
    </div>
  `

  const { html, text } = renderEmailLayout({
    preheader: headline,
    title: headline,
    intro,
    bodyHtml,
    ctaLabel: 'Ver expediente',
    ctaUrl: input.caseDeepLink,
  })

  return {
    subject: input.isMention
      ? `${input.authorName} te mencionó · ${input.caseCode}`
      : `Nuevo mensaje · ${input.caseCode}`,
    html,
    text,
  }
}
