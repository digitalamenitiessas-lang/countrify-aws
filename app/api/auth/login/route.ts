import { NextRequest, NextResponse } from 'next/server'
import { signInWithCognitoPassword } from '@/lib/aws/cognito'
import { findProfileByEmail } from '@/lib/db/profiles'
import { createSessionToken, getAppSessionCookieDescriptor } from '@/lib/auth/session'

type LoginBody = {
  email?: string
  password?: string
}

export async function POST(req: NextRequest) {
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

  try {
    await signInWithCognitoPassword(email, password)

    const profile = await findProfileByEmail(email)
    if (!profile) {
      return NextResponse.json(
        { error: 'La cuenta existe en Cognito, pero todavia no tiene perfil CITIFY en AWS.' },
        { status: 403 },
      )
    }

    const token = createSessionToken({
      provider: 'cognito',
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
      },
    })
    const cookie = getAppSessionCookieDescriptor(token, expiresAtUnix, { secure: secureCookie })
    response.cookies.set(cookie.name, cookie.value, cookie.options)
    return response
  } catch (error: any) {
    const message =
      error?.name === 'NotAuthorizedException'
        ? 'Email o password invalidos.'
        : error?.name === 'UserNotFoundException'
          ? 'Usuario no encontrado.'
          : error instanceof Error
            ? error.message
            : 'No se pudo iniciar sesion.'

    return NextResponse.json({ error: message }, { status: 401 })
  }
}
