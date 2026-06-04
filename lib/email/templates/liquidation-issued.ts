import { renderEmailLayout, escapeHtml } from '@/lib/email/layout'

const MONTH_LABELS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

interface LiquidationIssuedInput {
  recipientName: string
  propertyName: string
  unitCode: string
  periodYear: number
  periodMonth: number
  ordinaryAmount: number
  extraordinaryAmount: number
  previousBalance: number
  subtotal: number
  publicLink: string
  paymentAccount?: {
    name: string
    bankName: string | null
    accountNumber: string | null
    cbu: string | null
    alias: string | null
  } | null
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(n)
}

export function renderLiquidationIssuedEmail(input: LiquidationIssuedInput): {
  subject: string
  html: string
  text: string
} {
  const monthLabel = MONTH_LABELS[input.periodMonth - 1] ?? `mes ${input.periodMonth}`
  const periodLabel = `${monthLabel} ${input.periodYear}`
  const titleCasePeriod = `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)} ${input.periodYear}`

  const extraRows = input.extraordinaryAmount > 0
    ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;">Extraordinarias</td><td style="padding:6px 0;text-align:right;font-size:13px;">${formatARS(input.extraordinaryAmount)}</td></tr>`
    : ''
  const prevRows = input.previousBalance !== 0
    ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;">Saldo anterior</td><td style="padding:6px 0;text-align:right;font-size:13px;">${formatARS(input.previousBalance)}</td></tr>`
    : ''

  const a = input.paymentAccount
  const paymentBlock = a
    ? `
    <div style="margin:16px 0;padding:16px;background:#F4FAF5;border:1px solid #C7E2CC;border-radius:12px;">
      <div style="font-size:12px;color:#2F5D36;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">Datos para el pago</div>
      <div style="margin-top:8px;font-size:13px;color:#1A1A1A;line-height:1.6;">
        <strong>${escapeHtml(a.name)}</strong>${a.bankName ? ` · ${escapeHtml(a.bankName)}` : ''}<br/>
        ${a.accountNumber ? `Cuenta: <strong>${escapeHtml(a.accountNumber)}</strong><br/>` : ''}
        ${a.cbu ? `CBU: <strong>${escapeHtml(a.cbu)}</strong><br/>` : ''}
        ${a.alias ? `Alias: <strong>${escapeHtml(a.alias)}</strong>` : ''}
      </div>
      <div style="margin-top:10px;font-size:11px;color:#5A7A60;">Una vez realizado el pago, podés cargar el comprobante desde tu panel de vecino.</div>
    </div>`
    : ''

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(input.recipientName)}</strong>,</p>
    <p style="margin:0 0 12px;">Se emitió la liquidación de expensas de <strong>${escapeHtml(titleCasePeriod)}</strong> para tu unidad en ${escapeHtml(input.propertyName)}.</p>
    <div style="margin:16px 0;padding:16px;background:#FFF6F2;border:1px solid #F2C9B8;border-radius:12px;">
      <div style="font-size:12px;color:#666;letter-spacing:0.5px;text-transform:uppercase;">Unidad ${escapeHtml(input.unitCode)} · ${escapeHtml(periodLabel)}</div>
      <table cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:12px;font-family:inherit;">
        <tr><td style="padding:6px 0;color:#666;font-size:13px;">Expensas ordinarias</td><td style="padding:6px 0;text-align:right;font-size:13px;">${formatARS(input.ordinaryAmount)}</td></tr>
        ${extraRows}
        ${prevRows}
        <tr><td colspan="2" style="border-top:1px solid #F2C9B8;padding-top:8px;"></td></tr>
        <tr><td style="padding:6px 0;font-weight:600;color:#1A1A1A;font-size:14px;">Total a pagar</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#F04E23;font-size:16px;">${formatARS(input.subtotal)}</td></tr>
      </table>
    </div>
    ${paymentBlock}
    <p style="margin:16px 0 0;font-size:13px;color:#666;">Acceso al detalle completo y comprobantes:</p>
  `

  const { html, text } = renderEmailLayout({
    preheader: `${titleCasePeriod} · Total ${formatARS(input.subtotal)}`,
    title: `Liquidación de ${titleCasePeriod}`,
    bodyHtml,
    ctaLabel: 'Ver detalle de liquidación',
    ctaUrl: input.publicLink,
    footerNote: 'El link es personal y no requiere ingreso a Countrify.',
  })

  return {
    subject: `${input.propertyName} · Expensas ${titleCasePeriod}: ${formatARS(input.subtotal)}`,
    html,
    text,
  }
}
