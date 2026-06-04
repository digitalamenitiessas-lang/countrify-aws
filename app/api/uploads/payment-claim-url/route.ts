import { NextRequest, NextResponse } from 'next/server'
import { createPaymentClaimUploadUrl } from '@/lib/aws/s3'
import { getCurrentProfile } from '@/lib/auth'
import { pgQuery } from '@/lib/db/postgres'

type UploadRequestBody = {
  unitId?: string
  fileName?: string
  contentType?: string
}

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  let body: UploadRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload invalido.' }, { status: 400 })
  }

  if (!body.unitId || !body.fileName) {
    return NextResponse.json({ error: 'Faltan datos del archivo.' }, { status: 400 })
  }

  // El vecino principal de la unidad es el unico autorizado a subir
  // comprobantes (es el responsable del pago).
  const membership = await pgQuery<{ administration_id: string }>(
    `select mp.administration_id
       from public.unit_profile_memberships m
       join public.iadmin_units u on u.id = m.unit_id
       join public.iadmin_managed_properties mp on mp.id = u.managed_property_id
      where m.unit_id = $1
        and m.profile_id = $2
        and m.relationship_type = 'vecino_principal'
        and m.active = true
      limit 1`,
    [body.unitId, profile.id],
  )
  if (membership.rows.length === 0) {
    return NextResponse.json(
      { error: 'No autorizado para esta unidad.' },
      { status: 403 },
    )
  }

  try {
    const result = await createPaymentClaimUploadUrl({
      administrationId: membership.rows[0].administration_id,
      unitId: body.unitId,
      fileName: body.fileName,
      contentType: body.contentType || 'application/octet-stream',
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[S3] payment claim upload url error:', error)
    return NextResponse.json(
      { error: 'No pudimos preparar la carga del comprobante.' },
      { status: 500 },
    )
  }
}
