import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'node:crypto'

const SESSION_COOKIE_NAME = 'countrify_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12

export type AppSessionPayload = {
  provider: 'cognito'
  email: string
  profileId: string | null
  role: string | null
  exp: number
}

function getSessionSecret() {
  const secret = process.env.APP_SESSION_SECRET
  if (!secret) {
    throw new Error('APP_SESSION_SECRET no esta configurada.')
  }
  return secret
}

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + padding, 'base64').toString('utf8')
}

function signPayload(payloadB64: string) {
  return toBase64Url(createHmac('sha256', getSessionSecret()).update(payloadB64).digest())
}

export function createSessionToken(session: Omit<AppSessionPayload, 'exp'>, ttlSeconds = SESSION_TTL_SECONDS) {
  const payload: AppSessionPayload = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }

  const payloadB64 = toBase64Url(JSON.stringify(payload))
  const signature = signPayload(payloadB64)
  return `${payloadB64}.${signature}`
}

export function verifySessionToken(token: string): AppSessionPayload | null {
  const [payloadB64, signature] = token.split('.')
  if (!payloadB64 || !signature) {
    return null
  }

  const expected = signPayload(payloadB64)
  const actualBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expected)

  if (actualBuf.length !== expectedBuf.length) {
    return null
  }

  if (!timingSafeEqual(actualBuf, expectedBuf)) {
    return null
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadB64)) as AppSessionPayload
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export async function getAppSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) {
    return null
  }
  return verifySessionToken(token)
}

export async function setAppSessionCookie(token: string, expiresAtUnix: number) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAtUnix * 1000),
  })
}

export async function clearAppSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  })
}

export function getAppSessionCookieDescriptor(
  token: string,
  expiresAtUnix: number,
  options: { secure?: boolean } = {},
) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: options.secure ?? process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(expiresAtUnix * 1000),
    },
  }
}

export function getClearedAppSessionCookieDescriptor(options: { secure?: boolean } = {}) {
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: options.secure ?? process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(0),
    },
  }
}
