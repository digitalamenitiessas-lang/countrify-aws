import { NextRequest, NextResponse } from 'next/server'
import { createMarketplaceUploadUrl } from '@/lib/aws/s3'
import { getCurrentProfile } from '@/lib/auth'

type UploadRequestBody = {
  itemId?: string
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

  if (!body.itemId || !body.fileName) {
    return NextResponse.json({ error: 'Faltan datos del archivo.' }, { status: 400 })
  }

  try {
    const result = await createMarketplaceUploadUrl({
      profileId: profile.id,
      itemId: body.itemId,
      fileName: body.fileName,
      contentType: body.contentType || 'application/octet-stream',
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[S3] marketplace upload url error:', error)
    return NextResponse.json({ error: 'No pudimos preparar la carga del archivo.' }, { status: 500 })
  }
}
