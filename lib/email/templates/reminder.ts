import { renderEmailLayout, escapeHtml } from '@/lib/email/layout'

interface ReminderEmailInput {
  recipientName: string
  propertyName: string
  unitCode: string
  reminderKind: 'pre_due' | 'overdue_first' | 'overdue_second' | 'overdue_heavy'
  amountDue: number
  dueLabel: string
  dueDate: string
  messageBody: string
  publicLink: string | null
}

function subjectFor(input: ReminderEmailInput): string {
  switch (input.reminderKind) {
    case 'pre_due':
      return `${input.propertyName} · Recordatorio de vencimiento ${input.unitCode}`
    case 'overdue_first':
      return `${input.propertyName} · Vencimiento adeudado ${input.unitCode}`
    case 'overdue_second':
      return `${input.propertyName} · Expensas vencidas ${input.unitCode}`
    case 'overdue_heavy':
      return `${input.propertyName} · Deuda acumulada ${input.unitCode}`
  }
}

function headingFor(kind: ReminderEmailInput['reminderKind']): string {
  switch (kind) {
    case 'pre_due':
      return 'Recordatorio de vencimiento'
    case 'overdue_first':
      return 'Vencimiento adeudado'
    case 'overdue_second':
      return 'Expensas vencidas'
    case 'overdue_heavy':
      return 'Deuda acumulada'
  }
}

export function renderReminderEmail(input: ReminderEmailInput): {
  subject: string
  html: string
  text: string
} {
  const amountStr = `$${input.amountDue.toLocaleString('es-AR')}`
  const heading = headingFor(input.reminderKind)

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(input.recipientName)}</strong>,</p>
    <p style="margin:0 0 16px;color:#555;">
      Te enviamos este recordatorio sobre las expensas de tu unidad
      <strong>${escapeHtml(input.unitCode)}</strong> en <strong>${escapeHtml(input.propertyName)}</strong>.
    </p>
    <div style="margin:16px 0;padding:16px;background:#FFF6F2;border:1px solid #F2C9B8;border-radius:12px;">
      <div style="font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:#F04E23;font-weight:600;margin-bottom:6px;">
        ${escapeHtml(heading)}
      </div>
      <div style="font-size:22px;font-weight:700;color:#1A1A1A;line-height:1.2;">${escapeHtml(amountStr)}</div>
      <div style="margin-top:8px;font-size:13px;color:#555;">
        ${escapeHtml(input.dueLabel)} · vence ${escapeHtml(input.dueDate)}
      </div>
    </div>
    <div style="margin:16px 0;padding:14px;background:#F7F7F7;border-radius:10px;font-size:13px;color:#444;line-height:1.55;white-space:pre-wrap;">
      ${escapeHtml(input.messageBody)}
    </div>
  `

  const layoutInput: Parameters<typeof renderEmailLayout>[0] = {
    preheader: `${input.propertyName}: ${heading} ${amountStr}`,
    title: heading,
    bodyHtml,
    footerNote: 'Podés desactivar estos mails desde Configuración → Notificaciones.',
  }
  if (input.publicLink) {
    layoutInput.ctaLabel = 'Ver liquidación'
    layoutInput.ctaUrl = input.publicLink
  }

  const { html, text } = renderEmailLayout(layoutInput)

  return { subject: subjectFor(input), html, text }
}
