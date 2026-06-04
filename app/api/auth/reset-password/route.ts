import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { pgQuery } from '@/lib/db/postgres'
import { adminSetCognitoPassword, isCognitoConfigured } from '@/lib/aws/cognito'
import { clearPasswordMustChange, findProfileByEmailAnySource } from '@/lib/db/profiles'
import { getClientIp, rateLimitResponse } from '@/lib/rate-limit'

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function validatePassword(pwd: string): string | null {
  if (pwd.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  if (pwd.length > 72) return 'La contraseña es demasiado larga.'
  return null
}

export async function POST(request: NextRequest) {
  // Rate limit por IP: 10 intentos por minuto. El token ya es 32-byte
  // random + hasheado, asi que brute force es imposible — esto es solo
  // para evitar abuso del endpoint.
  const ip = getClientIp(request.headers)
  const limited = rateLimitResponse(`auth:reset:${ip}`, { max: 10, windowSeconds: 60 })
  if (limited) return limited

  const body = (await request.json().catch(() => null)) as
    | { token?: string; password?: string }
    | null
  const token = body?.token?.trim()
  const password = body?.password

  if (!token || !password) {
    return NextResponse.json({ error: 'Token y contraseña son requeridos.' }, { status: 400 })
  }

  const validationError = validatePassword(password)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  if (!isCognitoConfigured()) {
    return NextResponse.json({ error: 'Auth no configurado.' }, { status: 500 })
  }

  const tokenHash = hashToken(token)

  // Buscamos el token: tiene que existir, no estar usado, y no estar expirado.
  const tokenRes = await pgQuery<{ id: string; profile_id: string }>(
    `select id, profile_id
       from countrify.password_reset_tokens
      where token_hash = $1
        and used_at is null
        and expires_at > now()
      limit 1`,
    [tokenHash],
  )
  const tokenRow = tokenRes.rows[0]
  if (!tokenRow) {
    return NextResponse.json(
      { error: 'El link ya expiró o no es válido. Pedí un nuevo link.' },
      { status: 400 },
    )
  }

  // Reconstruimos el profile desde countrify.profiles o countrify.profiles
  // (no podemos JOIN-ear directo porque el FK puede apuntar a cualquiera).
  const primaryRes = await pgQuery<{ email: string }>(
    `select email from countrify.profiles where id = $1 limit 1`,
    [tokenRow.profile_id],
  )
  const businessRes = primaryRes.rows[0]
    ? { rows: [] as Array<{ email: string }> }
    : await pgQuery<{ email: string }>(
        `select email from countrify.profiles where id = $1 limit 1`,
        [tokenRow.profile_id],
      )

  const source: 'primary' | 'business' = primaryRes.rows[0] ? 'primary' : 'business'
  const email = (primaryRes.rows[0] ?? businessRes.rows[0])?.email
  if (!email) {
    return NextResponse.json(
      { error: 'No encontramos la cuenta asociada al link.' },
      { status: 400 },
    )
  }

  try {
    await adminSetCognitoPassword({ email, newPassword: password, source })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error de auth'
    return NextResponse.json({ error: `No pudimos actualizar la contraseña: ${msg}` }, { status: 502 })
  }

  await pgQuery(
    `update countrify.password_reset_tokens set used_at = now() where id = $1`,
    [tokenRow.id],
  )
  await clearPasswordMustChange(tokenRow.profile_id)

  return NextResponse.json({ ok: true })
}

// Valida un token sin consumirlo (para que la pagina del form pueda mostrar
// "link invalido" antes de pedir la nueva pwd).
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim()
  if (!token) {
    return NextResponse.json({ valid: false }, { status: 400 })
  }
  const tokenHash = hashToken(token)
  const res = await pgQuery<{ profile_id: string }>(
    `select profile_id
       from countrify.password_reset_tokens
      where token_hash = $1
        and used_at is null
        and expires_at > now()
      limit 1`,
    [tokenHash],
  )
  const row = res.rows[0]
  if (!row) {
    return NextResponse.json({ valid: false })
  }
  const nameRes = await pgQuery<{ full_name: string }>(
    `select full_name from countrify.profiles where id = $1
     union all
     select full_name from countrify.profiles where id = $1
     limit 1`,
    [row.profile_id],
  )
  return NextResponse.json({ valid: true, fullName: nameRes.rows[0]?.full_name ?? null })
}
