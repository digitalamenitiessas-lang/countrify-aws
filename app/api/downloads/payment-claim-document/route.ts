import { NextRequest, NextResponse } from 'next/server'
import { createPrivateS3DownloadUrl } from '@/lib/aws/s3'
import { getCurrentProfile, getIAdminContext } from '@/lib/auth'
import { pgQuery } from '@/lib/db/postgres'

export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const claimId = req.nextUrl.searchParams.get('claimId')
  if (!claimId) {
    return NextResponse.json({ error: 'claimId requerido.' }, { status: 400 })
  }

  const res = await pgQuery<{
    administration_id: string
    document_object_key: string | null
    reporter_profile_id: string
  }>(
    `select administration_id, document_object_key, reporter_profile_id
       from countrify.iadmin_payment_claims
      where id = $1
      limit 1`,
    [claimId],
  )
  const claim = res.rows[0]
  if (!claim) return NextResponse.json({ error: 'No encontrado.' }, { status: 404 })
  if (!claim.document_object_key) {
    return NextResponse.json({ error: 'Sin comprobante.' }, { status: 404 })
  }

  // Acceso: el reportante o un admin de la administración.
  let allowed = claim.reporter_profile_id === profile.id
  if (!allowed) {
    const ctx = await getIAdminContext(profile)
    allowed =
      ctx.isSuperAdmin ||
      ctx.memberships.some((m) => m.administration.id === claim.administration_id)
  }
  if (!allowed) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  const url = await createPrivateS3DownloadUrl(claim.document_object_key)
  return NextResponse.redirect(url, 307)
}
