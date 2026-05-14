import { NextRequest, NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

// SQL para crear la tabla si no existe (ejecutar en Supabase SQL editor):
//
// create table if not exists push_subscriptions (
//   id uuid primary key default gen_random_uuid(),
//   profile_id uuid references profiles(id) on delete cascade not null,
//   endpoint text not null,
//   p256dh text not null,
//   auth text not null,
//   created_at timestamptz default now(),
//   unique(profile_id, endpoint)
// );

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NextResponse.json({ error: 'No configurado' }, { status: 500 })

  const body = await req.json()
  const { endpoint, keys } = body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    { profile_id: profile.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: 'profile_id,endpoint' }
  )

  if (error) {
    console.error('[Push] Error guardando suscripción:', error.message)
    return NextResponse.json({ error: 'Error al guardar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
