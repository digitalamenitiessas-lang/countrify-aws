import { NextRequest, NextResponse } from 'next/server'
import { findProfileCredentialsByEmail } from '@/lib/db/profiles'
import { verifyDummyPassword, verifyPassword } from '@/lib/auth/password'
import { createSessionToken, getAppSessionCookieDescriptor } from '@/lib/auth/session'
import { getClientIp, rateLimitResponse } from '@/lib/rate-limit'

type LoginBody = {
  email?: string
  password?: string
}

// Un unico mensaje para "no existe la cuenta" y "la password no coincide": si
// se distinguieran, cualquiera podria averiguar que emails estan registrados.
const INVALID_CREDENTIALS = 'Email o password invalidos.'

export async function POST(req: NextRequest) {
  // Rate limit por IP: 10 intentos por minuto. Evita brute force.
  const ip = getClientIp(req.headers)
  const limited = rateLimitResponse(`auth:login:${ip}`, { max: 10, windowSeconds: 60 })
  if (limited) return limited

  let body: LoginBody

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload invalido.' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const password = body.password ?? ''
  const secureCookie = req.headers.get('x-forwarded-proto') === 'https'

  if (!email || !password) {
    return NextResponse.json({ error: 'Email y password son obligatorios.' }, { status: 400 })
  }

  // Segundo limite, por cuenta. El de arriba es por IP y solo frena a un
  // atacante que pega desde una sola direccion; con IPs rotativas, una cuenta
  // concreta queda sin ningun freno. Cognito aportaba este bloqueo por usuario
  // y al sacarlo habia que reponerlo.
  //
  // Va DESPUES de parsear el body porque necesita el email, y por eso mismo no
  // filtra informacion: responde igual exista o no la cuenta.
  const emailLimited = rateLimitResponse(`auth:login:email:${email}`, { max: 10, windowSeconds: 900 })
  if (emailLimited) return emailLimited

  try {
    const found = await findProfileCredentialsByEmail(email)

    // Sin cuenta (o con una cuenta sin hash, que no puede loguear) igual
    // gastamos un verify contra un hash dummy: asi el tiempo de respuesta no
    // delata si el email existe.
    if (!found || !found.passwordHash) {
      await verifyDummyPassword(password)
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 })
    }

    const passwordOk = await verifyPassword(found.passwordHash, password)
    if (!passwordOk) {
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 })
    }

    const { profile } = found

    const token = createSessionToken({
      provider: 'local',
      email,
      profileId: profile.id,
      role: profile.role,
    })

    const expiresAtUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 12
    const response = NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        passwordMustChange: profile.passwordMustChange,
      },
    })
    const cookie = getAppSessionCookieDescriptor(token, expiresAtUnix, { secure: secureCookie })
    response.cookies.set(cookie.name, cookie.value, cookie.options)
    return response
  } catch (error) {
    // Falla de infraestructura (base caida, APP_SESSION_SECRET sin setear). No
    // devolvemos el detalle al cliente.
    console.error('[auth/login] error inesperado:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'No se pudo iniciar sesion.' }, { status: 500 })
  }
}
