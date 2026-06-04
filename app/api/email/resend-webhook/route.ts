import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { pgQuery } from '@/lib/db/postgres'

// Webhook de Resend (reemplaza app/api/email/ses-webhook). Recibe eventos
// email.bounced / email.complained / email.delivered / email.delivery_delayed
// y actualiza email_events.status. En bounces duros y complaints prende
// profiles.email_blocked para frenar futuros envios al address.
//
// Seguridad: Resend firma los webhooks con Svix. Verificamos la firma HMAC-SHA256
// usando RESEND_WEBHOOK_SECRET (formato "whsec_<base64>"). Sin secret configurado
// rechazamos (fail-closed) salvo que ALLOW_UNSIGNED_EMAIL_WEBHOOK=1 en dev.

interface ResendEvent {
  type: string
  created_at?: string
  data: {
    email_id?: string
    to?: string[]
    from?: string
    subject?: string
    bounce?: { type?: string; subType?: string; message?: string }
    // complaints no traen sub-estructura util; usamos `to`.
  }
}

function verifySvixSignature(req: NextRequest, rawBody: string): boolean {
  if (process.env.ALLOW_UNSIGNED_EMAIL_WEBHOOK === '1') return true

  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[resend-webhook] RESEND_WEBHOOK_SECRET no configurado: rechazo')
    return false
  }

  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')
  if (!svixId || !svixTimestamp || !svixSignature) return false

  // El secret viene como "whsec_<base64>"; firmamos sobre `${id}.${ts}.${body}`.
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64')

  // El header puede traer varias firmas separadas por espacio: "v1,<sig> v1,<sig>"
  for (const part of svixSignature.split(' ')) {
    const sig = part.split(',')[1] ?? part
    try {
      const a = Buffer.from(sig)
      const b = Buffer.from(expected)
      if (a.length === b.length && timingSafeEqual(a, b)) return true
    } catch {
      // sigue probando
    }
  }
  return false
}

export async function POST(req: NextRequest) {
  const raw = await req.text()

  if (!verifySvixSignature(req, raw)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 })
  }

  let event: ResendEvent
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'email.bounced':
        await handleBounce(event)
        break
      case 'email.complained':
        await handleComplaint(event)
        break
      case 'email.delivered':
        await handleDelivery(event)
        break
      default:
        // email.sent / email.delivery_delayed / email.opened / etc.: ignorar.
        break
    }
  } catch (err) {
    console.error('[resend-webhook] handler error', err)
    return NextResponse.json({ error: 'handler error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

async function handleBounce(e: ResendEvent) {
  const messageId = e.data.email_id
  const bounceType = e.data.bounce?.type ?? 'Unknown'
  // Resend marca los hard bounces con type "Permanent"/"hard".
  const isHard = /permanent|hard/i.test(bounceType)

  if (messageId) {
    await pgQuery(
      `update public.email_events
          set status = 'bounced',
              bounced_at = now(),
              metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb
        where ses_message_id = $1`,
      [
        messageId,
        JSON.stringify({
          provider: 'resend',
          bounce_type: bounceType,
          bounce_sub_type: e.data.bounce?.subType ?? null,
          bounce_message: e.data.bounce?.message ?? null,
        }),
      ],
    )
  }

  if (isHard) {
    for (const addr of e.data.to ?? []) {
      await pgQuery(
        `update public.profiles
            set email_blocked = true,
                email_blocked_reason = $2,
                email_blocked_at = coalesce(email_blocked_at, now())
          where lower(email) = lower($1)`,
        [addr, `hard_bounce: ${e.data.bounce?.subType ?? bounceType}`],
      )
    }
  }
}

async function handleComplaint(e: ResendEvent) {
  const messageId = e.data.email_id

  if (messageId) {
    await pgQuery(
      `update public.email_events
          set status = 'complained',
              complained_at = now(),
              metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb
        where ses_message_id = $1`,
      [messageId, JSON.stringify({ provider: 'resend' })],
    )
  }

  // Quejas SIEMPRE bloquean (decision del usuario).
  for (const addr of e.data.to ?? []) {
    await pgQuery(
      `update public.profiles
          set email_blocked = true,
              email_blocked_reason = $2,
              email_blocked_at = coalesce(email_blocked_at, now())
        where lower(email) = lower($1)`,
      [addr, 'complaint'],
    )
  }
}

async function handleDelivery(e: ResendEvent) {
  if (!e.data.email_id) return
  await pgQuery(
    `update public.email_events
        set status = case when status = 'sent' then 'delivered' else status end,
            delivered_at = now()
      where ses_message_id = $1`,
    [e.data.email_id],
  )
}
