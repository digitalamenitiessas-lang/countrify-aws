import { NextResponse } from 'next/server'
import { requireIAdmin } from '@/lib/auth'
import { listPaymentsByAdminFromPostgres } from '@/lib/db/iadmin-reads'
import { buildCsv, csvResponseHeaders, formatMoneyAr } from '@/lib/iadmin/csv'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function parseInt0(v: string | null): number | null {
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function GET(request: Request) {
  const { context } = await requireIAdmin({ capability: 'reports.view' })
  const administrationId = context.primary?.administration.id
  if (!administrationId) {
    return NextResponse.json({ error: 'no administration assigned' }, { status: 400 })
  }

  const url = new URL(request.url)
  const sp = url.searchParams
  const statusInput = sp.get('status')?.toLowerCase()
  const status: 'live' | 'voided' | 'all' =
    statusInput === 'voided' ? 'voided' : statusInput === 'all' ? 'all' : 'live'

  const rows = await listPaymentsByAdminFromPostgres({
    administrationId,
    periodYear: parseInt0(sp.get('periodYear')),
    periodMonth: parseInt0(sp.get('periodMonth')),
    unitId: sp.get('unitId')?.trim() || null,
    status,
    method: sp.get('method')?.trim() || null,
    limit: 5000, // hard cap para no romper el browser
  })

  const csv = buildCsv({
    headers: [
      'Recibo',
      'Fecha',
      'Consorcio',
      'Unidad',
      'Titular',
      'Período',
      'Monto',
      'Recargo',
      'Método',
      'Referencia',
      'Cuenta',
      'Estado',
      'Motivo anulación',
      'Anulado por',
      'Anulado el',
      'Cargado por',
    ],
    rows: rows.map((p) => [
      p.receipt_number ?? '',
      p.paid_at?.slice(0, 10) ?? '',
      p.property_display_name?.trim() || p.building_name || '',
      p.unit_code ?? '',
      p.holder_name ?? '',
      p.period_year && p.period_month
        ? `${String(p.period_month).padStart(2, '0')}/${p.period_year}`
        : '',
      formatMoneyAr(p.amount),
      formatMoneyAr(p.surcharge_amount),
      p.method ?? '',
      p.reference ?? '',
      p.cash_account_name ?? '',
      p.is_void ? 'Anulado' : 'Vigente',
      p.void_reason ?? '',
      p.voided_by_name ?? '',
      p.voided_at?.slice(0, 10) ?? '',
      p.created_by_name ?? '',
    ]),
  })

  return new NextResponse(csv, { headers: csvResponseHeaders('pagos') })
}
