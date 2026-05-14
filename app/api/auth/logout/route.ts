import { NextRequest, NextResponse } from 'next/server'
import { getClearedAppSessionCookieDescriptor } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ ok: true })
  const secureCookie = req.headers.get('x-forwarded-proto') === 'https'
  const cookie = getClearedAppSessionCookieDescriptor({ secure: secureCookie })
  response.cookies.set(cookie.name, cookie.value, cookie.options)
  return response
}
