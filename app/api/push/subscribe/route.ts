import { NextRequest, NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { upsertPushSubscriptionInPostgres } from '@/lib/db/business'

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { endpoint, keys } = body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
  }

  try {
    await upsertPushSubscriptionInPostgres({
      profileId: profile.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    })
  } catch (error) {
    console.error('[Push] Error guardando suscripción:', error)
    return NextResponse.json({ error: 'Error al guardar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
