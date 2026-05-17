import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { insertMarketplaceItemInPostgres } from '@/lib/db/business'

export async function POST(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
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

  try {
    await insertMarketplaceItemInPostgres({
      id: itemId,
      sellerProfileId: profile.id,
      buildingId: profile.buildingId,
      title,
      price,
      description,
      condition,
      imagePath,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error' },
      { status: 500 },
    )
  }
}
