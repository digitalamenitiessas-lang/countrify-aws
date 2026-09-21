import { NextRequest, NextResponse } from 'next/server'
import { createBusinessAssetUploadUrl, validateUpload } from '@/lib/storage/s3'
import { getCurrentProfile } from '@/lib/auth'

type UploadRequestBody = {
  kind?: 'business-logo' | 'promotion-image'
  businessId?: string
  recordId?: string
  fileName?: string
  contentType?: string
  sizeBytes?: number
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

  if (!body.kind || !body.businessId || !body.recordId || !body.fileName) {
    return NextResponse.json({ error: 'Faltan datos del archivo.' }, { status: 400 })
  }

  if (body.kind !== 'business-logo' && body.kind !== 'promotion-image') {
    return NextResponse.json({ error: 'Tipo de archivo no permitido.' }, { status: 400 })
  }

  try {
    if (profile.businessId !== body.businessId) {
      return NextResponse.json({ error: 'No autorizado para subir archivos de este negocio.' }, { status: 403 })
    }

    // Validacion server-side: extension, content-type y tamano. Antes esto
    // vivia solo en el cliente y la URL prefirmada servia para subir cualquier
    // cosa, de cualquier peso.
    const invalid = validateUpload(body.kind, {
      fileName: body.fileName,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
    })
    if (invalid) {
      return NextResponse.json({ error: invalid.error }, { status: invalid.status })
    }

    const result = await createBusinessAssetUploadUrl({
      kind: body.kind,
      businessId: body.businessId,
      recordId: body.recordId,
      fileName: body.fileName,
      contentType: body.contentType || 'application/octet-stream',
      sizeBytes: body.sizeBytes,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[S3] business asset upload url error:', error)
    return NextResponse.json({ error: 'No pudimos preparar la carga del archivo.' }, { status: 500 })
  }
}
