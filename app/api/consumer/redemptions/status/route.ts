import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const admin = getSupabaseAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Supabase admin no esta configurado.' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const promotionId = searchParams.get('promotionId')

  if (!promotionId) {
    return NextResponse.json({ error: 'Falta promotionId.' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('promotion_redemptions')
    .select('id, redeemed_at, created_at')
    .eq('profile_id', profile.id)
    .eq('promotion_id', promotionId)
    .eq('status', 'redeemed')
    .order('redeemed_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    redeemed: Boolean(data?.id),
    redemption: data
      ? {
          id: data.id,
          redeemedAt: data.redeemed_at ?? data.created_at,
        }
      : null,
  })
}
