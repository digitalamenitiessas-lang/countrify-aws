import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { pgQuery } from '@/lib/db/postgres'
import { findProfileByEmailAnySource } from '@/lib/db/profiles'
import { sendNotificationEmail } from '@/lib/email/send'
import { renderPasswordResetEmail } from '@/lib/email/templates/password-reset'
import { getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const RESET_EXPIRES_HOURS = 24
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://countrify.com.ar'

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function newToken(): { plain: string; hash: string } {
  const plain = crypto.randomBytes(32).toString('base64url')
  return { plain, hash: hashToken(plain) }
}

export async function POST(request: NextRequest) {
  // Doble rate limit:
  //   - por IP: 10 por hora (evita spam masivo desde un atacante).
  //   - por email: 3 por hora (evita molestar a un usuario con muchos mails).
  const rateLimitIp = getClientIp(request.headers)
  const ipLimited = rateLimitResponse(`auth:forgot:ip:${rateLimitIp}`, { max: 10, windowSeconds: 3600 })
  if (ipLimited) return ipLimited

  const body = (await request.json().catch(() => null)) as { email?: string } | null
  const rawEmail = body?.email?.trim().toLowerCase()

  if (!rawEmail) {
    return NextResponse.json({ error: 'Email requerido.' }, { status: 400 })
  }

  const emailLimited = rateLimitResponse(`auth:forgot:email:${rawEmail}`, { max: 3, windowSeconds: 3600 })
  if (emailLimited) return emailLimited

  // Lookup en ambos schemas. NO devolvemos al cliente si existe o no — siempre
  // 200 ok para no permitir enumeracion de cuentas.
  const found = await findProfileByEmailAnySource(rawEmail)

  if (!found) {
    await new Promise((r) => setTimeout(r, 350))
    return NextResponse.json({ ok: true })
  }

  const { profile } = found
  const { plain, hash } = newToken()
  const expiresAt = new Date(Date.now() + RESET_EXPIRES_HOURS * 60 * 60 * 1000)
  const ip = (request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '').split(',')[0]?.trim() || null
  const userAgent = request.headers.get('user-agent') ?? null

  // Invalidamos tokens previos no usados del mismo profile para que solo
  // el ultimo sirva.
  await pgQuery(
    `update public.password_reset_tokens
        set used_at = now()
      where profile_id = $1 and used_at is null and expires_at > now()`,
    [profile.id],
  )
  await pgQuery(
    `insert into public.password_reset_tokens
       (profile_id, token_hash, requested_ip, user_agent, expires_at)
     values ($1, $2, $3::inet, $4, $5)`,
    [profile.id, hash, ip, userAgent, expiresAt.toISOString()],
  )

  const resetUrl = `${SITE_URL}/reset/${plain}`
  const tpl = renderPasswordResetEmail({
    fullName: profile.fullName,
    resetUrl,
    expiresHours: RESET_EXPIRES_HOURS,
    requestedIp: ip,
  })

  await sendNotificationEmail({
    templateKey: 'password_reset',
    to: { email: profile.email, profileId: profile.id, fullName: profile.fullName },
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    metadata: { ip: ip ?? undefined },
  })

  return NextResponse.json({ ok: true })
}
