import { NextResponse } from 'next/server'
import { requireIAdmin } from '@/lib/auth'
import { listMorososByAdminFromPostgres } from '@/lib/db/iadmin-reads'
import { materializeLateFeesForAdministrationInPostgres } from '@/lib/db/iadmin-writes'
import { buildCsv, csvResponseHeaders, formatMoneyAr } from '@/lib/iadmin/csv'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const { context } = await requireIAdmin({ capability: 'reports.view' })
  const administrationId = context.primary?.administration.id
  if (!administrationId) {
    return NextResponse.json({ error: 'no administration assigned' }, { status: 400 })
  }

  await materializeLateFeesForAdministrationInPostgres({
    administrationId,
    asOfDate: new Date().toISOString().slice(0, 10),
    actorProfileId: null,
  })

  const rows = await listMorososByAdminFromPostgres({ administrationId })

  const csv = buildCsv({
    headers: [
      'Consorcio',
      'Unidad',
      'Titular',
      'Email',
      'Teléfono',
      'Items abiertos',
      'Total adeudado',
      'Al día',
      '0-30 días',
      '31-60 días',
      '61-90 días',
      'Más de 90 días',
      'Vencimiento más viejo',
      'Último pago',
    ],
    rows: rows.map((r) => [
      r.property_display_name?.trim() || r.building_name || '',
      r.unit_code,
      r.holder_name ?? '',
      r.holder_email ?? '',
      r.holder_phone ?? '',
      r.open_items_count,
      formatMoneyAr(r.total_balance),
      formatMoneyAr(r.bucket_current),
      formatMoneyAr(r.bucket_0_30),
      formatMoneyAr(r.bucket_31_60),
      formatMoneyAr(r.bucket_61_90),
      formatMoneyAr(r.bucket_over_90),
      r.oldest_due_date ?? '',
      r.last_payment_at?.slice(0, 10) ?? '',
    ]),
  })

  return new NextResponse(csv, { headers: csvResponseHeaders('morosos') })
}
