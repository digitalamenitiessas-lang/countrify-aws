import { NextRequest, NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

type SavePromotionBody = {
  id?: string
  businessId?: string
  title?: string
  description?: string
  discount?: string
  category?: string
  expirationDate?: string
  buildingId?: string | null
  imagePath?: string | null
}

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const admin = getSupabaseAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Supabase admin no esta configurado.' }, { status: 500 })
  }

  let body: SavePromotionBody

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload invalido.' }, { status: 400 })
  }

  if (!profile.businessId || profile.businessId !== body.businessId) {
    return NextResponse.json({ error: 'No autorizado para operar este negocio.' }, { status: 403 })
  }

  if (!body.id || !body.title || !body.description || !body.discount || !body.category || !body.expirationDate) {
    return NextResponse.json({ error: 'Faltan datos de la promocion.' }, { status: 400 })
  }

  const payload = {
    id: body.id,
    business_id: body.businessId,
    title: body.title,
    description: body.description,
    discount: body.discount,
    category: body.category,
    expiration_date: body.expirationDate,
    building_id: body.buildingId ?? null,
    image_path: body.imagePath ?? null,
    is_active: true,
  }

  const operation = req.nextUrl.searchParams.get('mode') === 'update'
    ? admin.from('promotions').update(payload).eq('id', body.id).eq('business_id', profile.businessId)
    : admin.from('promotions').insert(payload)

  const { error } = await operation

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
