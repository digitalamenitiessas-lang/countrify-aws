import { NextRequest, NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { updateBusinessFieldsInPostgres } from '@/lib/db/business'

type UpdateBusinessProfileBody = {
  businessId?: string
  logoPath?: string | null
  address?: string
  latitude?: number
  longitude?: number
}

export async function PATCH(req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile?.businessId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  let body: UpdateBusinessProfileBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload invalido.' }, { status: 400 })
  }

  if (!body.businessId || body.businessId !== profile.businessId) {
    return NextResponse.json({ error: 'No autorizado para operar este negocio.' }, { status: 403 })
  }

  const patch: Parameters<typeof updateBusinessFieldsInPostgres>[1] = {}
  if (body.logoPath !== undefined) patch.logo_path = body.logoPath
  if (body.address !== undefined) patch.address = body.address
  if (body.latitude !== undefined) patch.latitude = body.latitude
  if (body.longitude !== undefined) patch.longitude = body.longitude

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No hay cambios para guardar.' }, { status: 400 })
  }

  try {
    await updateBusinessFieldsInPostgres(profile.businessId, patch)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar' },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true })
}
