import { renderEmailLayout, escapeHtml } from '@/lib/email/layout'

const STATUS_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  en_revision: 'En revisión',
  en_curso: 'En curso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
}

interface ComplaintStatusChangedInput {
  recipientName: string
  buildingName: string
  caseCode: string
  caseTitle: string
  previousStatus: string
  newStatus: string
  changedByName: string
  caseDeepLink: string
}

export function renderComplaintStatusChangedEmail(input: ComplaintStatusChangedInput): {
  subject: string
  html: string
  text: string
} {
  const newStatusLabel = STATUS_LABELS[input.newStatus] ?? input.newStatus
  const prevStatusLabel = STATUS_LABELS[input.previousStatus] ?? input.previousStatus

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(input.recipientName)}</strong>,</p>
    <p style="margin:0 0 12px;">${escapeHtml(input.changedByName)} actualizó el estado de tu expediente.</p>
    <div style="margin:16px 0;padding:14px;background:#FFF6F2;border:1px solid #F2C9B8;border-radius:10px;">
      <div style="font-size:12px;color:#666;letter-spacing:0.5px;text-transform:uppercase;">${escapeHtml(input.buildingName)} · ${escapeHtml(input.caseCode)}</div>
      <div style="font-size:15px;font-weight:600;color:#1A1A1A;margin-top:4px;">${escapeHtml(input.caseTitle)}</div>
      <div style="margin-top:12px;display:flex;align-items:center;gap:8px;font-size:14px;">
        <span style="padding:3px 10px;background:#EEE;border-radius:999px;color:#666;font-size:12px;">${escapeHtml(prevStatusLabel)}</span>
        <span style="color:#999;">→</span>
        <span style="padding:3px 10px;background:#F04E23;border-radius:999px;color:#FFF;font-weight:600;font-size:12px;">${escapeHtml(newStatusLabel)}</span>
      </div>
    </div>
  `

  const { html, text } = renderEmailLayout({
    preheader: `${input.caseCode}: ${prevStatusLabel} → ${newStatusLabel}`,
    title: `Tu expediente está ${newStatusLabel.toLowerCase()}`,
    bodyHtml,
    ctaLabel: 'Ver expediente',
    ctaUrl: input.caseDeepLink,
  })

  return {
    subject: `${input.caseCode}: ahora ${newStatusLabel.toLowerCase()}`,
    html,
    text,
  }
}
