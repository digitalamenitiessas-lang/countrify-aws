import { NextRequest, NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { adminSetCognitoPassword, signInWithCognitoPassword, signInWithBusinessPool } from '@/lib/aws/cognito'
import { clearPasswordMustChange, findBusinessProfileById, findProfileById } from '@/lib/db/profiles'
import { getClientIp, rateLimitResponse } from '@/lib/rate-limit'

function validatePassword(pwd: string): string | null {
  if (typeof pwd !== 'string') return 'Contraseña inválida.'
  if (pwd.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  if (pwd.length > 72) return 'La contraseña es demasiado larga.'
  return null
}

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
  const validationError = validatePassword(newPassword)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  // Re-leemos el profile completo para tener passwordMustChange actualizado.
  // Negocios viven en countrify.profiles, todos los demas en countrify.profiles.
  const isBusiness = profile.role === 'negocio_admin'
  const fullProfile = isBusiness
    ? await findBusinessProfileById(profile.id)
    : await findProfileById(profile.id)

  if (!fullProfile) {
    return NextResponse.json({ error: 'Perfil no encontrado.' }, { status: 404 })
  }

  const source: 'primary' | 'business' = isBusiness ? 'business' : 'primary'

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
    try {
      if (source === 'business') {
        await signInWithBusinessPool(fullProfile.email, currentPassword)
      } else {
        await signInWithCognitoPassword(fullProfile.email, currentPassword)
      }
    } catch (error: unknown) {
      const name = (error as { name?: string } | null)?.name
      const message =
        name === 'NotAuthorizedException'
          ? 'La contraseña actual no es correcta.'
          : 'No pudimos verificar tu contraseña actual. Probá de nuevo.'
      return NextResponse.json({ error: message }, { status: 401 })
    }
  }

  if (currentPassword && currentPassword === newPassword) {
    return NextResponse.json(
      { error: 'La nueva contraseña tiene que ser distinta de la actual.' },
      { status: 400 },
    )
  }

  try {
    await adminSetCognitoPassword({ email: fullProfile.email, newPassword, source })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error de auth'
    return NextResponse.json(
      { error: `No pudimos actualizar la contraseña: ${msg}` },
      { status: 502 },
    )
  }

  await clearPasswordMustChange(fullProfile.id)

  return NextResponse.json({ ok: true, wasForced: fullProfile.passwordMustChange })
}
