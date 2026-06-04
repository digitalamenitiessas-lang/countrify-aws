import { renderEmailLayout, escapeHtml } from '@/lib/email/layout'

interface ComplaintCreatedInput {
  recipientName: string
  buildingName: string
  caseCode: string
  caseTitle: string
  authorName: string
  caseDeepLink: string
}

export function renderComplaintCreatedEmail(input: ComplaintCreatedInput): {
  subject: string
  html: string
  text: string
} {
  const bodyHtml = `
    <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(input.recipientName)}</strong>,</p>
    <p style="margin:0 0 12px;">Se abrió un expediente nuevo en <strong>${escapeHtml(input.buildingName)}</strong>.</p>
    <div style="margin:16px 0;padding:14px;background:#FFF6F2;border:1px solid #F2C9B8;border-radius:10px;">
      <div style="font-size:12px;color:#666;letter-spacing:0.5px;text-transform:uppercase;">Expediente ${escapeHtml(input.caseCode)}</div>
      <div style="font-size:15px;font-weight:600;color:#1A1A1A;margin-top:4px;">${escapeHtml(input.caseTitle)}</div>
      <div style="font-size:13px;color:#666;margin-top:6px;">Abierto por ${escapeHtml(input.authorName)}.</div>
    </div>
  `

  const { html, text } = renderEmailLayout({
    preheader: `Nuevo expediente en ${input.buildingName}: ${input.caseTitle}`,
    title: 'Nuevo expediente abierto',
    bodyHtml,
    ctaLabel: 'Ver expediente',
    ctaUrl: input.caseDeepLink,
  })

  return {
    subject: `Nuevo expediente en ${input.buildingName}: ${input.caseTitle}`,
    html,
    text,
  }
}
