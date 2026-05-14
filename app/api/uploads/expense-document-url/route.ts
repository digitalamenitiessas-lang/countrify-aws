import { NextRequest, NextResponse } from 'next/server'
import { createExpenseDocumentUploadUrl } from '@/lib/aws/s3'
import { getCurrentProfile, getIAdminContext } from '@/lib/auth'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

type UploadRequestBody = {
  expenseId?: string
  fileName?: string
  contentType?: string
}

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase admin no configurado.' }, { status: 500 })
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
    const { data: expense } = await supabase
      .from('iadmin_expenses')
      .select('id, administration_id')
      .eq('id', body.expenseId)
      .maybeSingle()

    if (!expense) {
      return NextResponse.json({ error: 'Gasto no encontrado.' }, { status: 404 })
    }

    const context = await getIAdminContext(profile)

    const canUpload = context.isSuperAdmin
      || context.memberships.some(
        (membership) =>
          membership.administration.id === expense.administration_id
          && membership.capabilities.includes('documents.upload'),
      )

    if (!canUpload) {
      return NextResponse.json({ error: 'No autorizado para subir comprobantes de este gasto.' }, { status: 403 })
    }

    const result = await createExpenseDocumentUploadUrl({
      administrationId: expense.administration_id,
      expenseId: body.expenseId,
      fileName: body.fileName,
      contentType: body.contentType || 'application/octet-stream',
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[S3] expense document upload url error:', error)
    return NextResponse.json({ error: 'No pudimos preparar la carga del comprobante.' }, { status: 500 })
  }
}
