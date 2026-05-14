import { NextRequest, NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

type ValidateBody = {
  rawToken?: string
}

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile?.businessId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const admin = getSupabaseAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Supabase admin no esta configurado.' }, { status: 500 })
  }

  let body: ValidateBody

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload invalido.' }, { status: 400 })
  }

  const rawToken = body.rawToken?.trim()
  if (!rawToken) {
    return NextResponse.json({ error: 'Ingresa el codigo del cupon.' }, { status: 400 })
  }

  const { data, error } = await admin.rpc('validate_promotion_redemption_token', {
    raw_token: rawToken,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const row = Array.isArray(data) ? data[0] : null
  if (!row) {
    return NextResponse.json({ error: 'No se pudo validar el codigo.' }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    result: {
      status: row.status,
      message: row.message,
      tokenId: row.token_id ?? null,
      promotionId: row.promotion_id ?? null,
      promotionTitle: row.promotion_title ?? null,
      neighborName: row.neighbor_name ?? null,
      redeemedAt: row.redeemed_at ?? null,
    },
  })
}
