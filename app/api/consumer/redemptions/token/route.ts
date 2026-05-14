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

  const { data, error } = await admin.rpc('create_promotion_redemption_token', {
    target_promotion_id: promotionId,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const row = Array.isArray(data) ? data[0] : null
  if (!row) {
    return NextResponse.json({ error: 'No se pudo generar el codigo del cupon.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    token: {
      id: row.id,
      token: row.token,
      qrValue: row.qr_value,
      expiresAt: row.expires_at,
      promotionId: row.promotion_id,
      promotionTitle: row.promotion_title,
      businessName: row.business_name,
    },
  })
}
