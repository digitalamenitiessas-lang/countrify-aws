import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { getCurrentProfile } from '@/lib/auth'
import { listPushSubscriptionsForProfileFromPostgres } from '@/lib/db/business'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_MAILTO = process.env.VAPID_MAILTO ?? 'mailto:admin@citify.app'

export async function POST(req: NextRequest) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: 'VAPID no configurado' }, { status: 500 })
  }

  webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { profileId, title, body, url, tag } = await req.json()
  if (!profileId || !title || !body) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const canSend =
    profile.role === 'super_admin' ||
    profile.role === 'consorcio_admin' ||
    profile.role === 'negocio_admin'
  if (!canSend) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const subs = await listPushSubscriptionsForProfileFromPostgres(profileId)
  if (subs.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  const payload = JSON.stringify({ title, body, url: url ?? '/', tag })
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ),
    ),
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  return NextResponse.json({ sent, total: subs.length })
}
