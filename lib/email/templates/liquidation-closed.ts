import { renderEmailLayout, escapeHtml } from '@/lib/email/layout'

const MONTH_LABELS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

interface LiquidationClosedInput {
  recipientName: string
  propertyName: string
  periodYear: number
  periodMonth: number
  closedByName: string
  runDeepLink: string
}

export function renderLiquidationClosedEmail(input: LiquidationClosedInput): {
  subject: string
  html: string
  text: string
} {
  const monthLabel = MONTH_LABELS[input.periodMonth - 1] ?? `mes ${input.periodMonth}`
  const titleCasePeriod = `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)} ${input.periodYear}`

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(input.recipientName)}</strong>,</p>
    <p style="margin:0 0 12px;">${escapeHtml(input.closedByName)} cerró la liquidación de <strong>${escapeHtml(titleCasePeriod)}</strong> en <strong>${escapeHtml(input.propertyName)}</strong>.</p>
    <p style="margin:0 0 12px;color:#666;font-size:14px;">Una vez cerrada, ya no admite modificaciones. Cualquier corrección debe registrarse como saldo previo en el próximo período.</p>
  `

  const { html, text } = renderEmailLayout({
    preheader: `${input.propertyName}: ${titleCasePeriod} cerrada.`,
    title: `Liquidación de ${titleCasePeriod} cerrada`,
    bodyHtml,
    ctaLabel: 'Ver corrida de liquidación',
    ctaUrl: input.runDeepLink,
  })

  return {
    subject: `${input.propertyName} · ${titleCasePeriod} cerrada`,
    html,
    text,
  }
}
