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
  const itemId = typeof body?.id === 'string' ? body.id : null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const condition = typeof body?.condition === 'string' ? body.condition.trim() : ''
  const imagePath = typeof body?.imagePath === 'string' ? body.imagePath : null
  const price = Number(body?.price)

  if (!itemId || !title || !description || !condition || !Number.isFinite(price)) {
    return NextResponse.json({ error: 'Faltan datos obligatorios para publicar.' }, { status: 400 })
  }

  if (!profile.buildingId) {
    return NextResponse.json({ error: 'Tu perfil no tiene edificio asociado.' }, { status: 400 })
  }

  const { error } = await admin.from('marketplace_items').insert({
    id: itemId,
    seller_profile_id: profile.id,
    building_id: profile.buildingId,
    title,
    price,
    description,
    condition,
    image_path: imagePath,
    is_active: true,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
