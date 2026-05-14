import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const admin = getSupabaseAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Supabase admin no esta configurado.' }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const promotionId = typeof body?.promotionId === 'string' ? body.promotionId : null

  if (!promotionId) {
    return NextResponse.json({ error: 'Falta promotionId.' }, { status: 400 })
  }

  const { data: existing, error: existingError } = await admin
    .from('saved_promotions')
    .select('profile_id,promotion_id')
    .eq('profile_id', profile.id)
    .eq('promotion_id', promotionId)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  if (existing) {
    const { error } = await admin
      .from('saved_promotions')
      .delete()
      .eq('profile_id', profile.id)
      .eq('promotion_id', promotionId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, saved: false })
  }

  const { error } = await admin
    .from('saved_promotions')
    .insert({ profile_id: profile.id, promotion_id: promotionId })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, saved: true })
}
