import { pgQuery } from '@/lib/db/postgres'

export type PublicLiquidationView = {
  token: string
  expiresAt: string | null
  unitCode: string
  unitKind: string
  holderName: string | null
  holderKind: string | null
  propertyName: string
  propertyAddress: string
  periodYear: number
  periodMonth: number
  runStatus: string
  ordinaryAmount: number
  extraordinaryAmount: number
  previousBalance: number
  subtotal: number
  collectedAmount: number
  balanceRemaining: number
  dueDates: Array<{ label: string; date: string; surchargePct: number; amount: number }>
  legalInfo: {
    bank?: { name?: string; cbu?: string; alias?: string; account?: string }
    collectionSchedule?: string
    accountantName?: string
    accountantPhone?: string
  }
  recentPayments: Array<{
    receiptNumber: string | null
    paidAt: string
    amount: number
    method: string | null
  }>
}

/**
 * Lee una liquidacion por token publico. Retorna null si el token no
 * existe, esta revocado o expiro.
 */
export async function getPublicLiquidationByToken(token: string): Promise<PublicLiquidationView | null> {
  // Token + item + run + admin + property + building + period en una sola query
  const itemResult = await pgQuery<{
    token: string
    expires_at: string | null
    revoked_at: string | null
    item_id: string
    ordinary_amount: string | null
    extraordinary_amount: string | null
    previous_balance: string | null
    run_status: string
    run_due_dates: any
    administration_legal_info: any
    property_display_name: string | null
    property_legal_info: any
    building_name: string | null
    building_address: string | null
    period_year: number | null
    period_month: number | null
    unit_code: string | null
    unit_kind: string | null
    holder_full_name: string | null
    holder_kind: string | null
  }>(
    `
      with chosen_holder as (
        select distinct on (unit_id) unit_id, full_name, holder_kind::text as holder_kind, is_active
        from countrify.iadmin_unit_holders
        order by unit_id, is_active desc, created_at asc
      )
      select
        t.token, t.expires_at::text as expires_at, t.revoked_at::text as revoked_at,
        i.id as item_id,
        i.ordinary_amount::text as ordinary_amount,
        i.extraordinary_amount::text as extraordinary_amount,
        i.previous_balance::text as previous_balance,
        r.status::text as run_status,
        r.due_dates as run_due_dates,
        a.legal_info as administration_legal_info,
        mp.display_name as property_display_name,
        mp.legal_info as property_legal_info,
        b.name as building_name,
        b.address as building_address,
        ap.period_year, ap.period_month,
        u.code as unit_code, u.kind::text as unit_kind,
        ch.full_name as holder_full_name, ch.holder_kind as holder_kind
      from countrify.iadmin_item_share_tokens t
      inner join countrify.iadmin_liquidation_items i on i.id = t.liquidation_item_id
      inner join countrify.iadmin_liquidation_runs r on r.id = i.liquidation_run_id
      inner join countrify.iadmin_administrations a on a.id = r.administration_id
      inner join countrify.iadmin_managed_properties mp on mp.id = r.managed_property_id
      inner join countrify.buildings b on b.id = mp.building_id
      left join countrify.iadmin_accounting_periods ap on ap.id = r.accounting_period_id
      inner join countrify.iadmin_units u on u.id = i.unit_id
      left join chosen_holder ch on ch.unit_id = u.id
      where t.token = $1
      limit 1
    `,
    [token],
  )

  const row = itemResult.rows[0]
  if (!row) return null
  if (row.revoked_at) return null
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null

  // Pagos vivos del item
  const paymentsResult = await pgQuery<{
    receipt_number: string | null
    paid_at: string
    amount: string
    method: string | null
  }>(
    `
      select receipt_number, paid_at::text as paid_at, amount::text as amount, method
      from countrify.iadmin_payments
      where liquidation_item_id = $1 and is_void = false
      order by paid_at desc
    `,
    [row.item_id],
  )
  const payments = paymentsResult.rows
  const collectedAmount = payments.reduce((s: any, p: any) => s + Number(p.amount), 0)

  const ordinary = Number(row.ordinary_amount ?? 0)
  const extra = Number(row.extraordinary_amount ?? 0)
  const prev = Number(row.previous_balance ?? 0)
  const subtotal = Math.round((ordinary + extra + prev) * 100) / 100
  const balance = Math.max(0, Math.round((subtotal - collectedAmount) * 100) / 100)

  const rawDueDates = Array.isArray(row.run_due_dates) ? row.run_due_dates : []
  const dueDates = rawDueDates.map((d: any) => {
    const pct = Number(d.surcharge_pct ?? d.surchargePct ?? 0)
    return {
      label: d.label ?? '',
      date: d.date ?? '',
      surchargePct: pct,
      amount: Math.round(subtotal * (1 + pct / 100) * 100) / 100,
    }
  })

  // Incrementar access_count (fire and forget)
  pgQuery(
    `update countrify.iadmin_item_share_tokens set access_count = coalesce(access_count, 0) + 1, last_accessed_at = now() where token = $1`,
    [token],
  ).catch(() => undefined)

  const adminLegal = (row.administration_legal_info ?? {}) as any
  const propertyLegal = (row.property_legal_info ?? {}) as any
  const mergedLegal = { ...adminLegal, ...propertyLegal }

  return {
    token,
    expiresAt: row.expires_at,
    unitCode: row.unit_code ?? '—',
    unitKind: row.unit_kind ?? 'otro',
    holderName: row.holder_full_name,
    holderKind: row.holder_kind,
    propertyName: row.property_display_name ?? row.building_name ?? 'Consorcio',
    propertyAddress: row.building_address ?? '',
    periodYear: row.period_year ?? 0,
    periodMonth: row.period_month ?? 0,
    runStatus: row.run_status ?? 'draft',
    ordinaryAmount: ordinary,
    extraordinaryAmount: extra,
    previousBalance: prev,
    subtotal,
    collectedAmount: Math.round(collectedAmount * 100) / 100,
    balanceRemaining: balance,
    dueDates,
    legalInfo: {
      bank: mergedLegal.bank,
      collectionSchedule: mergedLegal.collectionSchedule,
      accountantName: mergedLegal.accountantName,
      accountantPhone: mergedLegal.accountantPhone,
    },
    recentPayments: payments.slice(0, 5).map((p: any) => ({
      receiptNumber: p.receipt_number,
      paidAt: p.paid_at,
      amount: Number(p.amount),
      method: p.method,
    })),
  }
}
