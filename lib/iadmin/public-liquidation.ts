import { getSupabaseAdminClient } from '@/lib/supabase/admin'

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
 * Lee una liquidacion por token publico (bypass RLS via service role).
 * Retorna null si el token no existe, esta revocado o expiro.
 */
export async function getPublicLiquidationByToken(token: string): Promise<PublicLiquidationView | null> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return null

  const { data: tokenRow } = await supabase
    .from('iadmin_item_share_tokens')
    .select('token, expires_at, revoked_at, liquidation_item_id')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow || tokenRow.revoked_at) return null
  if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) return null

  const { data: item } = await supabase
    .from('iadmin_liquidation_items')
    .select(`
      id,
      ordinary_amount, extraordinary_amount, previous_balance,
      liquidation_run_id,
      iadmin_liquidation_runs!inner (
        status, due_dates,
        administration_id,
        iadmin_administrations (legal_info),
        iadmin_managed_properties (display_name, legal_info, buildings(name, address)),
        iadmin_accounting_periods (period_year, period_month)
      ),
      iadmin_units!inner (code, kind, iadmin_unit_holders(full_name, holder_kind, is_active))
    `)
    .eq('id', tokenRow.liquidation_item_id)
    .maybeSingle()

  if (!item) return null

  const run = Array.isArray(item.iadmin_liquidation_runs) ? item.iadmin_liquidation_runs[0] : item.iadmin_liquidation_runs
  if (!run) return null
  const unit = Array.isArray(item.iadmin_units) ? item.iadmin_units[0] : item.iadmin_units
  const holders = Array.isArray(unit?.iadmin_unit_holders) ? unit.iadmin_unit_holders : []
  const activeHolder = holders.find((h: any) => h?.is_active) ?? holders[0] ?? null

  const property = Array.isArray(run.iadmin_managed_properties) ? run.iadmin_managed_properties[0] : run.iadmin_managed_properties
  const building = property?.buildings
    ? Array.isArray(property.buildings)
      ? property.buildings[0]
      : property.buildings
    : null
  const period = Array.isArray(run.iadmin_accounting_periods) ? run.iadmin_accounting_periods[0] : run.iadmin_accounting_periods
  const administration = Array.isArray(run.iadmin_administrations) ? run.iadmin_administrations[0] : run.iadmin_administrations

  // Pagos vivos del item
  const { data: payments } = await supabase
    .from('iadmin_payments')
    .select('receipt_number, paid_at, amount, method')
    .eq('liquidation_item_id', item.id)
    .eq('is_void', false)
    .order('paid_at', { ascending: false })

  const collectedAmount = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)

  const ordinary = Number(item.ordinary_amount ?? 0)
  const extra = Number(item.extraordinary_amount ?? 0)
  const prev = Number(item.previous_balance ?? 0)
  const subtotal = Math.round((ordinary + extra + prev) * 100) / 100
  const balance = Math.max(0, Math.round((subtotal - collectedAmount) * 100) / 100)

  const rawDueDates = Array.isArray(run.due_dates) ? run.due_dates : []
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
  await supabase
    .from('iadmin_item_share_tokens')
    .update({ access_count: 1, last_accessed_at: new Date().toISOString() })
    .eq('token', token)

  const adminLegal = (administration?.legal_info ?? {}) as any
  const propertyLegal = (property?.legal_info ?? {}) as any
  const mergedLegal = { ...adminLegal, ...propertyLegal }

  return {
    token,
    expiresAt: tokenRow.expires_at ?? null,
    unitCode: unit?.code ?? '—',
    unitKind: unit?.kind ?? 'otro',
    holderName: activeHolder?.full_name ?? null,
    holderKind: activeHolder?.holder_kind ?? null,
    propertyName: property?.display_name ?? building?.name ?? 'Consorcio',
    propertyAddress: building?.address ?? '',
    periodYear: period?.period_year ?? 0,
    periodMonth: period?.period_month ?? 0,
    runStatus: run.status ?? 'draft',
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
    recentPayments: (payments ?? []).slice(0, 5).map((p) => ({
      receiptNumber: p.receipt_number ?? null,
      paidAt: p.paid_at,
      amount: Number(p.amount),
      method: p.method ?? null,
    })),
  }
}
