import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireIAdmin } from '@/lib/auth'
import { pgQuery } from '@/lib/db/postgres'
import { getLiquidationRunWithAdminFromPostgres } from '@/lib/db/iadmin-writes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ExpenseRow {
  issued_at: string | null
  expense_kind: string | null
  category: string | null
  provider_name: string | null
  description: string | null
  amount: string
  document_url: string | null
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: runId } = await ctx.params

  const run = await getLiquidationRunWithAdminFromPostgres(runId)
  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 })
  }

  await requireIAdmin({
    capability: 'liquidations.view',
    administrationId: run.administration_id,
  })

  const rows = await pgQuery<ExpenseRow>(
    `
      select
        to_char(e.issued_at, 'DD/MM/YYYY') as issued_at,
        e.expense_kind::text as expense_kind,
        e.category,
        p.name as provider_name,
        e.description,
        e.amount::text as amount,
        e.document_url
      from countrify.iadmin_expenses e
      left join countrify.iadmin_providers p on p.id = e.provider_id
      where e.managed_property_id = $1
        and e.accounting_period_id = $2
        and e.status = 'imputed'
      order by e.issued_at asc nulls last, e.created_at asc
    `,
    [run.managed_property_id, run.accounting_period_id],
  )

  const sheetData: Array<Record<string, string | number>> = rows.rows.map((r) => ({
    Fecha: r.issued_at ?? '',
    Tipo: r.expense_kind === 'extraordinaria' ? 'Extraordinaria' : 'Ordinaria',
    Categoría: r.category ?? '',
    Proveedor: r.provider_name ?? '',
    Concepto: r.description ?? '',
    Importe: Number(r.amount),
    Comprobante: r.document_url ?? '',
  }))

  const total = rows.rows.reduce((s, r) => s + Number(r.amount), 0)
  sheetData.push({
    Fecha: '',
    Tipo: '',
    Categoría: '',
    Proveedor: '',
    Concepto: 'TOTAL',
    Importe: total,
    Comprobante: '',
  })

  const ws = XLSX.utils.json_to_sheet(sheetData)
  ws['!cols'] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 18 },
    { wch: 28 },
    { wch: 36 },
    { wch: 14 },
    { wch: 36 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Gastos')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const fileName = `gastos-liquidacion-${runId.slice(0, 8)}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
