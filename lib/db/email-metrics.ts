import { pgQuery } from './postgres'

// Métricas de salud del canal email. Lee de public.email_events (alimentado
// por lib/email/send.ts + app/api/email/ses-webhook). Es source-of-truth
// local: SES también publica Reputation.BounceRate en CloudWatch, pero acá
// vemos por template + qué addresses están reventando.

export type EmailHealthWindow = '24h' | '7d' | '30d'

export interface EmailHealthSummary {
  window: EmailHealthWindow
  totalSent: number
  delivered: number
  bounced: number
  complained: number
  failed: number
  bounceRate: number
  complaintRate: number
  bounceRateBreach: boolean
  complaintRateBreach: boolean
}

const WINDOW_TO_INTERVAL: Record<EmailHealthWindow, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
}

// SES suspende sending arriba de 5% de bounce rate y 0.1% de complaint rate.
// Usamos un umbral interno más conservador para alertar antes.
export const BOUNCE_RATE_WARN_THRESHOLD = 0.03
export const COMPLAINT_RATE_WARN_THRESHOLD = 0.0005

export async function getEmailHealthSummary(window: EmailHealthWindow): Promise<EmailHealthSummary> {
  const interval = WINDOW_TO_INTERVAL[window]
  const { rows } = await pgQuery<{
    total: string
    delivered: string
    bounced: string
    complained: string
    failed: string
  }>(
    `select
        count(*)::text as total,
        count(*) filter (where status = 'delivered')::text as delivered,
        count(*) filter (where status = 'bounced')::text as bounced,
        count(*) filter (where status = 'complained')::text as complained,
        count(*) filter (where status = 'failed')::text as failed
       from public.email_events
      where sent_at >= now() - $1::interval`,
    [interval],
  )

  const totalSent = Number(rows[0]?.total ?? '0')
  const delivered = Number(rows[0]?.delivered ?? '0')
  const bounced = Number(rows[0]?.bounced ?? '0')
  const complained = Number(rows[0]?.complained ?? '0')
  const failed = Number(rows[0]?.failed ?? '0')

  // El denominador es total sent — los suppressed (kill-switch) no cuentan
  // porque nunca tocaron a SES.
  const bounceRate = totalSent > 0 ? bounced / totalSent : 0
  const complaintRate = totalSent > 0 ? complained / totalSent : 0

  return {
    window,
    totalSent,
    delivered,
    bounced,
    complained,
    failed,
    bounceRate,
    complaintRate,
    bounceRateBreach: bounceRate >= BOUNCE_RATE_WARN_THRESHOLD,
    complaintRateBreach: complaintRate >= COMPLAINT_RATE_WARN_THRESHOLD,
  }
}

export interface TopBouncingAddress {
  toEmail: string
  bouncedCount: number
  lastBouncedAt: string | null
  lastBounceType: string | null
  emailBlocked: boolean
}

export async function listTopBouncingAddresses(limit = 20): Promise<TopBouncingAddress[]> {
  const { rows } = await pgQuery<{
    to_email: string
    bounced_count: string
    last_bounced_at: string | null
    last_bounce_type: string | null
    email_blocked: boolean | null
  }>(
    `select
        e.to_email,
        count(*)::text as bounced_count,
        max(e.bounced_at) as last_bounced_at,
        (array_agg(e.metadata ->> 'bounce_type' order by e.bounced_at desc nulls last))[1] as last_bounce_type,
        bool_or(coalesce(p.email_blocked, false)) as email_blocked
       from public.email_events e
       left join public.profiles p on lower(p.email) = lower(e.to_email)
      where e.status = 'bounced'
        and e.sent_at >= now() - interval '30 days'
      group by e.to_email
      order by count(*) desc, max(e.bounced_at) desc
      limit $1`,
    [limit],
  )

  return rows.map((row) => ({
    toEmail: row.to_email,
    bouncedCount: Number(row.bounced_count),
    lastBouncedAt: row.last_bounced_at,
    lastBounceType: row.last_bounce_type,
    emailBlocked: row.email_blocked ?? false,
  }))
}

export interface TemplateHealthRow {
  templateKey: string
  totalSent: number
  bounced: number
  complained: number
  bounceRate: number
}

export async function listTemplateHealth(window: EmailHealthWindow): Promise<TemplateHealthRow[]> {
  const interval = WINDOW_TO_INTERVAL[window]
  const { rows } = await pgQuery<{
    template_key: string
    total: string
    bounced: string
    complained: string
  }>(
    `select
        template_key,
        count(*)::text as total,
        count(*) filter (where status = 'bounced')::text as bounced,
        count(*) filter (where status = 'complained')::text as complained
       from public.email_events
      where sent_at >= now() - $1::interval
      group by template_key
      order by count(*) desc`,
    [interval],
  )

  return rows.map((row) => {
    const total = Number(row.total)
    const bounced = Number(row.bounced)
    return {
      templateKey: row.template_key,
      totalSent: total,
      bounced,
      complained: Number(row.complained),
      bounceRate: total > 0 ? bounced / total : 0,
    }
  })
}
