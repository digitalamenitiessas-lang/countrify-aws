import { NextRequest, NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { hashPassword, validatePasswordPolicy, verifyPassword } from '@/lib/auth/password'
import { clearPasswordMustChange, findProfileCredentialsById, setProfilePasswordHash } from '@/lib/db/profiles'
import { getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  // Rate limit: 5 intentos por minuto por profile + 20 por IP por hora.
  // El primero evita brute force del currentPassword del usuario logueado;
  // el segundo evita abuso desde una IP comprometida.
  const profileLimited = rateLimitResponse(`auth:change-pwd:profile:${profile.id}`, {
    max: 5,
    windowSeconds: 60,
  })
  if (profileLimited) return profileLimited
  const ip = getClientIp(req.headers)
  const ipLimited = rateLimitResponse(`auth:change-pwd:ip:${ip}`, {
    max: 20,
    windowSeconds: 3600,
  })
  if (ipLimited) return ipLimited

  const body = (await req.json().catch(() => null)) as
    | { currentPassword?: string; newPassword?: string }
    | null
  const newPassword = body?.newPassword
  const currentPassword = body?.currentPassword

  if (!newPassword) {
    return NextResponse.json({ error: 'Falta la nueva contraseña.' }, { status: 400 })
  }
  const validationError = validatePasswordPolicy(newPassword)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  // Re-leemos el profile completo (con su hash) para tener passwordMustChange
  // actualizado y poder verificar la contraseña actual.
  const credentials = await findProfileCredentialsById(profile.id)

  if (!credentials) {
    return NextResponse.json({ error: 'Perfil no encontrado.' }, { status: 404 })
  }

  const fullProfile = credentials.profile

  // En cambio in-session (no first-login) exigimos re-autenticacion con la
  // contraseña actual para no permitir que una sesion secuestrada cambie la
  // pwd sin conocerla.
  if (!fullProfile.passwordMustChange) {
    if (!currentPassword) {
      return NextResponse.json(
        { error: 'Tenés que ingresar tu contraseña actual.' },
        { status: 400 },
      )
    }
    const currentOk = credentials.passwordHash
      ? await verifyPassword(credentials.passwordHash, currentPassword)
      : false
    if (!currentOk) {
      return NextResponse.json({ error: 'La contraseña actual no es correcta.' }, { status: 401 })
    }
  }

  if (currentPassword && currentPassword === newPassword) {
    return NextResponse.json(
      { error: 'La nueva contraseña tiene que ser distinta de la actual.' },
      { status: 400 },
    )
  }

  try {
    await setProfilePasswordHash(fullProfile.id, await hashPassword(newPassword))
  } catch (error: unknown) {
    console.error(
      '[auth/change-password] no se pudo guardar el hash:',
      error instanceof Error ? error.message : error,
    )
    return NextResponse.json(
      { error: 'No pudimos actualizar la contraseña. Probá de nuevo.' },
      { status: 500 },
    )
  }

  await clearPasswordMustChange(fullProfile.id)

  return NextResponse.json({ ok: true, wasForced: fullProfile.passwordMustChange })
}
