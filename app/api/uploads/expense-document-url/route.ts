import { NextRequest, NextResponse } from 'next/server'
import { createExpenseDocumentUploadUrl, validateUpload } from '@/lib/storage/s3'
import { getCurrentProfile, getIAdminContext } from '@/lib/auth'
import { getExpenseStatusInfoFromPostgres } from '@/lib/db/iadmin-writes'

type UploadRequestBody = {
  expenseId?: string
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

  if (!body.expenseId || !body.fileName) {
    return NextResponse.json({ error: 'Faltan datos del archivo.' }, { status: 400 })
  }

  try {
    const expense = await getExpenseStatusInfoFromPostgres(body.expenseId)
    if (!expense) {
      return NextResponse.json({ error: 'Gasto no encontrado.' }, { status: 404 })
    }

    const context = await getIAdminContext(profile)
    const canUpload =
      context.isSuperAdmin ||
      context.memberships.some(
        (membership) =>
          membership.administration.id === expense.administration_id &&
          membership.capabilities.includes('documents.upload'),
      )

    if (!canUpload) {
      return NextResponse.json(
        { error: 'No autorizado para subir comprobantes de este gasto.' },
        { status: 403 },
      )
    }

    // Validacion server-side: extension, content-type y tamano. Antes esto
    // vivia solo en el cliente y la URL prefirmada servia para subir cualquier
    // cosa, de cualquier peso.
    const invalid = validateUpload('expense-document', {
      fileName: body.fileName,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
    })
    if (invalid) {
      return NextResponse.json({ error: invalid.error }, { status: invalid.status })
    }

    const result = await createExpenseDocumentUploadUrl({
      administrationId: expense.administration_id,
      expenseId: body.expenseId,
      fileName: body.fileName,
      contentType: body.contentType || 'application/octet-stream',
      sizeBytes: body.sizeBytes,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[S3] expense document upload url error:', error)
    return NextResponse.json(
      { error: 'No pudimos preparar la carga del comprobante.' },
      { status: 500 },
    )
  }
}
