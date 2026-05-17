import { NextRequest, NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { upsertPromotionInPostgres } from '@/lib/db/business'

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

  const mode = req.nextUrl.searchParams.get('mode') === 'update' ? 'update' : 'create'

  try {
    await upsertPromotionInPostgres({
      id: body.id,
      businessId: profile.businessId,
      title: body.title,
      description: body.description,
      discount: body.discount,
      category: body.category,
      expirationDate: body.expirationDate,
      buildingId: body.buildingId ?? null,
      imagePath: body.imagePath ?? null,
      mode,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al guardar' },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true })
}
