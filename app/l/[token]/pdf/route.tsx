import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { PublicLiquidationPdf } from '@/lib/iadmin/public-liquidation-pdf'
import { getPublicLiquidationByToken } from '@/lib/iadmin/public-liquidation'

// PDF descargable de la liquidacion publica (la misma que muestra el
// /l/[token]). El token funciona como gate: si esta revocado o expiro
// el read devuelve null -> 404.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function safeFilename(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // remueve diacriticos
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const view = await getPublicLiquidationByToken(token)
  if (!view) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const buffer = await renderToBuffer(<PublicLiquidationPdf view={view} />)

  const filenameBase = safeFilename(
    `liquidacion-${view.propertyName}-${view.unitCode}-${view.periodYear}-${String(view.periodMonth).padStart(2, '0')}`,
  )

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
