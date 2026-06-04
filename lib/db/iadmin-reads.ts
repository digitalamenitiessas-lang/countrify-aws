import { pgQuery } from '@/lib/db/postgres'

// ----------------------------------------------------------------------------
// Cash accounts + balance (suma de movimientos)
// ----------------------------------------------------------------------------

export type CashAccountWithBalanceRow = {
  id: string
  managed_property_id: string
  name: string
  kind: string
  bank_name: string | null
  account_number: string | null
  cbu: string | null
  alias: string | null
  opening_balance: string | null
  opening_balance_at: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  current_balance: string
  movements_count: number
}

export async function listCashAccountsWithBalanceFromPostgres(
  propertyId: string,
): Promise<CashAccountWithBalanceRow[]> {
  const result = await pgQuery<CashAccountWithBalanceRow>(
    `
      with sums as (
        select cash_account_id, coalesce(sum(amount), 0)::text as total, count(*)::int as moves_count
        from countrify.iadmin_bank_movements
        where managed_property_id = $1
        group by cash_account_id
      )
      select
        a.id,
        a.managed_property_id,
        a.name,
        a.kind::text as kind,
        a.bank_name,
        a.account_number,
        a.cbu,
        a.alias,
        a.opening_balance::text as opening_balance,
        a.opening_balance_at::text as opening_balance_at,
        a.notes,
        a.is_active,
        a.created_at::text as created_at,
        coalesce(s.total, '0') as current_balance,
        coalesce(s.moves_count, 0) as movements_count
      from countrify.iadmin_cash_accounts a
      left join sums s on s.cash_account_id = a.id
      where a.managed_property_id = $1
      order by a.is_active desc, a.created_at asc
    `,
    [propertyId],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Cash movements (con account name + expense description)
// ----------------------------------------------------------------------------

export type CashMovementRow = {
  id: string
  cash_account_id: string | null
  cash_account_name: string | null
  administration_id: string
  managed_property_id: string | null
  movement_date: string
  description: string | null
  amount: string
  balance: string | null
  external_ref: string | null
  movement_kind: string | null
  expense_id: string | null
  expense_description: string | null
  created_at: string
}

export async function listCashMovementsFromPostgres(input: {
  managedPropertyId: string
  accountId?: string | null
  limit: number
}): Promise<CashMovementRow[]> {
  const result = await pgQuery<CashMovementRow>(
    `
      select
        m.id,
        m.cash_account_id,
        ca.name as cash_account_name,
        m.administration_id,
        m.managed_property_id,
        m.movement_date::text as movement_date,
        m.description,
        m.amount::text as amount,
        null::text as balance,
        m.external_ref,
        m.movement_kind::text as movement_kind,
        m.expense_id,
        e.description as expense_description,
        m.created_at::text as created_at
      from countrify.iadmin_bank_movements m
      left join countrify.iadmin_cash_accounts ca on ca.id = m.cash_account_id
      left join countrify.iadmin_expenses e on e.id = m.expense_id
      where m.managed_property_id = $1
        and ($2::uuid is null or m.cash_account_id = $2)
      order by m.movement_date desc, m.created_at desc
      limit $3
    `,
    [input.managedPropertyId, input.accountId ?? null, input.limit],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Reminders con todo el contexto (property, unit, holder, share token)
// ----------------------------------------------------------------------------

export type ReminderRowWithContext = {
  id: string
  administration_id: string
  managed_property_id: string | null
  property_display_name: string | null
  building_name: string | null
  liquidation_item_id: string
  unit_code: string | null
  holder_full_name: string | null
  holder_phone: string | null
  holder_email: string | null
  reminder_kind: string
  status: string
  message_body: string | null
  amount_due: string | null
  due_label: string | null
  due_date: string | null
  generated_at: string
  sent_at: string | null
  dismissed_at: string | null
  share_token: string | null
}

export async function listRemindersWithContextFromPostgres(input: {
  administrationId: string
  status?: string | null
  limit: number
}): Promise<ReminderRowWithContext[]> {
  const result = await pgQuery<ReminderRowWithContext>(
    `
      with chosen_holder as (
        select distinct on (unit_id) unit_id, full_name, phone, email, is_active
        from countrify.iadmin_unit_holders
        order by unit_id, is_active desc, created_at asc
      ),
      live_token as (
        select distinct on (liquidation_item_id) liquidation_item_id, token
        from countrify.iadmin_item_share_tokens
        where revoked_at is null
        order by liquidation_item_id, created_at desc
      )
      select
        r.id,
        r.administration_id,
        r.managed_property_id,
        mp.display_name as property_display_name,
        b.name as building_name,
        r.liquidation_item_id,
        u.code as unit_code,
        ch.full_name as holder_full_name,
        ch.phone as holder_phone,
        ch.email as holder_email,
        r.reminder_kind::text as reminder_kind,
        r.status::text as status,
        r.message_body,
        r.amount_due::text as amount_due,
        r.due_label,
        r.due_date::text as due_date,
        r.generated_at::text as generated_at,
        r.sent_at::text as sent_at,
        r.dismissed_at::text as dismissed_at,
        lt.token as share_token
      from countrify.iadmin_reminders r
      left join countrify.iadmin_managed_properties mp on mp.id = r.managed_property_id
      left join countrify.buildings b on b.id = mp.building_id
      left join countrify.iadmin_liquidation_items i on i.id = r.liquidation_item_id
      left join countrify.iadmin_units u on u.id = i.unit_id
      left join chosen_holder ch on ch.unit_id = u.id
      left join live_token lt on lt.liquidation_item_id = i.id
      where r.administration_id = $1
        and ($2::text is null or r.status::text = $2)
      order by r.generated_at desc
      limit $3
    `,
    [input.administrationId, input.status ?? null, input.limit],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Expense detail con docs + extractions + payment + property name
// ----------------------------------------------------------------------------

export type ExpenseDetailRow = {
  id: string
  administration_id: string
  managed_property_id: string
  provider_name: string | null
  category: string | null
  description: string
  amount: string
  currency: string | null
  issued_at: string | null
  due_at: string | null
  status: string
  expense_kind: string | null
  created_at: string
  property_display_name: string | null
  building_name: string | null
}

export async function getExpenseDetailRowFromPostgres(
  expenseId: string,
): Promise<ExpenseDetailRow | null> {
  const result = await pgQuery<ExpenseDetailRow>(
    `
      select
        e.id,
        e.administration_id,
        e.managed_property_id,
        p.name as provider_name,
        e.category,
        e.description,
        e.amount::text as amount,
        e.currency,
        e.issued_at::text as issued_at,
        e.due_at::text as due_at,
        e.status::text as status,
        e.expense_kind::text as expense_kind,
        e.created_at::text as created_at,
        mp.display_name as property_display_name,
        b.name as building_name
      from countrify.iadmin_expenses e
      left join countrify.iadmin_providers p on p.id = e.provider_id
      left join countrify.iadmin_managed_properties mp on mp.id = e.managed_property_id
      left join countrify.buildings b on b.id = mp.building_id
      where e.id = $1
      limit 1
    `,
    [expenseId],
  )
  return result.rows[0] ?? null
}

export type ExpenseDocumentRowWithExtraction = {
  id: string
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_at: string
  extraction_id: string | null
  extraction_status: string | null
  extraction_provider: string | null
  extraction_suggested_fields: any
  extraction_confidence: number | null
  extraction_validated_by: string | null
  extraction_validated_at: string | null
  extraction_validation_notes: string | null
}

export async function listExpenseDocumentsWithExtractionFromPostgres(
  expenseId: string,
): Promise<ExpenseDocumentRowWithExtraction[]> {
  const result = await pgQuery<ExpenseDocumentRowWithExtraction>(
    `
      with picked_extraction as (
        select distinct on (document_id)
          document_id, id, status, provider, suggested_fields, confidence,
          validated_by, validated_at, validation_notes
        from countrify.iadmin_ai_document_extractions
        order by document_id, created_at desc
      )
      select
        d.id,
        d.storage_path,
        d.file_name,
        d.mime_type,
        d.size_bytes,
        d.uploaded_at::text as uploaded_at,
        x.id as extraction_id,
        x.status::text as extraction_status,
        x.provider as extraction_provider,
        x.suggested_fields as extraction_suggested_fields,
        x.confidence as extraction_confidence,
        x.validated_by as extraction_validated_by,
        x.validated_at::text as extraction_validated_at,
        x.validation_notes as extraction_validation_notes
      from countrify.iadmin_expense_documents d
      left join picked_extraction x on x.document_id = d.id
      where d.expense_id = $1
      order by d.uploaded_at desc
    `,
    [expenseId],
  )
  return result.rows
}

export type ExpensePaymentRow = {
  movement_date: string | null
  cash_account_name: string | null
}

// ----------------------------------------------------------------------------
// Consorcio dashboard (property + expenses + units + runs)
// ----------------------------------------------------------------------------

export type ManagedPropertyFullRow = {
  id: string
  administration_id: string
  building_id: string
  display_name: string | null
  property_kind: string
  tax_id: string | null
  managed_since: string | null
  management_fee_pct: string | null
  notes: string | null
  is_active: boolean
  legal_info: any
  created_at: string
  building_name: string
  building_address: string | null
  total_units: number | null
}

export async function getManagedPropertyFullFromPostgres(
  propertyId: string,
): Promise<ManagedPropertyFullRow | null> {
  const result = await pgQuery<ManagedPropertyFullRow>(
    `
      select
        mp.id, mp.administration_id, mp.building_id,
        mp.display_name, mp.property_kind::text as property_kind,
        mp.tax_id, mp.managed_since::text as managed_since,
        mp.management_fee_pct::text as management_fee_pct,
        mp.notes, mp.is_active, mp.legal_info,
        mp.created_at::text as created_at,
        b.name as building_name, b.address as building_address, b.total_units
      from countrify.iadmin_managed_properties mp
      inner join countrify.buildings b on b.id = mp.building_id
      where mp.id = $1
      limit 1
    `,
    [propertyId],
  )
  return result.rows[0] ?? null
}

export type ExpenseForDashboardRow = {
  id: string
  amount: string
  status: string
  expense_kind: string | null
  issued_at: string | null
  provider_id: string | null
  provider_name: string | null
}

export async function listExpensesForDashboardFromPostgres(
  propertyId: string,
): Promise<ExpenseForDashboardRow[]> {
  const result = await pgQuery<ExpenseForDashboardRow>(
    `
      select
        e.id, e.amount::text as amount, e.status::text as status,
        e.expense_kind::text as expense_kind, e.issued_at::text as issued_at,
        e.provider_id, p.name as provider_name
      from countrify.iadmin_expenses e
      left join countrify.iadmin_providers p on p.id = e.provider_id
      where e.managed_property_id = $1
      order by e.issued_at desc nulls last
    `,
    [propertyId],
  )
  return result.rows
}

export type UnpaidPayableExpenseRow = {
  id: string
  amount: string
  description: string
  category: string | null
  status: string
  issued_at: string | null
  document_type: string | null
  document_number: string | null
  provider_id: string | null
  provider_name: string | null
}

/**
 * Gastos por pagar de un consorcio: aprobados o imputados que todavía NO tienen
 * un movimiento de pago (expense_payment) en la caja. Es la fuente de la
 * sección "Proveedores a pagar" de Cuentas. No incluye borradores/rechazados ni
 * los que ya se pagaron.
 */
export async function listUnpaidPayableExpensesForPropertyFromPostgres(
  propertyId: string,
): Promise<UnpaidPayableExpenseRow[]> {
  const result = await pgQuery<UnpaidPayableExpenseRow>(
    `
      select
        e.id, e.amount::text as amount, e.description,
        e.category, e.status::text as status, e.issued_at::text as issued_at,
        e.document_type, e.document_number,
        e.provider_id, p.name as provider_name
      from countrify.iadmin_expenses e
      left join countrify.iadmin_providers p on p.id = e.provider_id
      where e.managed_property_id = $1
        and e.status in ('approved', 'imputed')
        and not exists (
          select 1 from countrify.iadmin_bank_movements m
          where m.expense_id = e.id and m.movement_kind = 'expense_payment'
        )
      order by e.issued_at asc nulls last, e.created_at asc
    `,
    [propertyId],
  )
  return result.rows
}

export async function countActiveUnitsByPropertyFromPostgres(
  propertyId: string,
): Promise<number> {
  const result = await pgQuery<{ c: number }>(
    `select count(*)::int as c from countrify.iadmin_units where managed_property_id = $1 and is_active = true`,
    [propertyId],
  )
  return result.rows[0]?.c ?? 0
}

export type DashboardRunRow = {
  id: string
  status: string
  ordinary_total: string | null
  extraordinary_total: string | null
  total_expenses: string | null
  accounting_period_id: string
  period_year: number | null
  period_month: number | null
}

export async function listDashboardRunsFromPostgres(input: {
  managedPropertyId: string
  limit: number
}): Promise<DashboardRunRow[]> {
  const result = await pgQuery<DashboardRunRow>(
    `
      select
        r.id, r.status::text as status,
        r.ordinary_total::text as ordinary_total,
        r.extraordinary_total::text as extraordinary_total,
        r.total_expenses::text as total_expenses,
        r.accounting_period_id,
        ap.period_year, ap.period_month
      from countrify.iadmin_liquidation_runs r
      left join countrify.iadmin_accounting_periods ap on ap.id = r.accounting_period_id
      where r.managed_property_id = $1 and r.status in ('calculated', 'issued', 'closed')
      order by r.generated_at desc
      limit $2
    `,
    [input.managedPropertyId, input.limit],
  )
  return result.rows
}

export type DashboardItemRow = {
  id: string
  liquidation_run_id: string
  ordinary_amount: string | null
  extraordinary_amount: string | null
  particular_amount: string | null
  previous_balance: string | null
}

export async function listDashboardItemsByRunsFromPostgres(
  runIds: string[],
): Promise<DashboardItemRow[]> {
  if (runIds.length === 0) return []
  const result = await pgQuery<DashboardItemRow>(
    `
      select id, liquidation_run_id, ordinary_amount::text as ordinary_amount,
             extraordinary_amount::text as extraordinary_amount,
             particular_amount::text as particular_amount,
             previous_balance::text as previous_balance
      from countrify.iadmin_liquidation_items
      where liquidation_run_id = any($1::uuid[])
    `,
    [runIds],
  )
  return result.rows
}

export async function listPaidExpenseIdsFromPostgres(
  expenseIds: string[],
): Promise<Set<string>> {
  if (expenseIds.length === 0) return new Set()
  const result = await pgQuery<{ expense_id: string }>(
    `select distinct expense_id from countrify.iadmin_bank_movements where movement_kind = 'expense_payment' and expense_id = any($1::uuid[])`,
    [expenseIds],
  )
  return new Set(result.rows.map((r: { expense_id: string }) => r.expense_id).filter(Boolean))
}

export async function sumLivePaymentsForRunFromPostgres(runId: string): Promise<number> {
  const result = await pgQuery<{ total: string }>(
    `select coalesce(sum(amount), 0)::text as total from countrify.iadmin_payments where liquidation_run_id = $1 and is_void = false`,
    [runId],
  )
  return Number(result.rows[0]?.total ?? 0)
}

export async function countPendingDocsForPropertyFromPostgres(
  propertyId: string,
): Promise<number> {
  const result = await pgQuery<{ c: number }>(
    `
      select count(*)::int as c
      from countrify.iadmin_ai_document_extractions x
      inner join countrify.iadmin_expense_documents d on d.id = x.document_id
      inner join countrify.iadmin_expenses e on e.id = d.expense_id
      where e.managed_property_id = $1 and x.status::text in ('pending', 'suggested')
    `,
    [propertyId],
  )
  return result.rows[0]?.c ?? 0
}

export async function countActiveRecurringProvidersFromPostgres(
  administrationId: string,
): Promise<number> {
  const result = await pgQuery<{ c: number }>(
    `select count(*)::int as c from countrify.iadmin_providers where administration_id = $1 and is_recurring = true and is_active = true`,
    [administrationId],
  )
  return result.rows[0]?.c ?? 0
}

// ----------------------------------------------------------------------------
// Mesa state (distribución en vivo del mes)
// ----------------------------------------------------------------------------

export type MesaUnitRow = {
  id: string
  code: string
  kind: string
  prorata_coefficient: string | null
  holder_full_name: string | null
  holder_phone: string | null
}

export async function listActiveUnitsWithProrataAndHolderFromPostgres(
  propertyId: string,
): Promise<MesaUnitRow[]> {
  const result = await pgQuery<MesaUnitRow>(
    `
      with chosen_holder as (
        select distinct on (unit_id)
          unit_id, full_name, phone, is_active
        from countrify.iadmin_unit_holders
        order by unit_id, is_active desc, created_at asc
      )
      select
        u.id, u.code, u.kind::text as kind,
        u.prorata_coefficient::text as prorata_coefficient,
        ch.full_name as holder_full_name,
        ch.phone as holder_phone
      from countrify.iadmin_units u
      left join chosen_holder ch on ch.unit_id = u.id
      where u.managed_property_id = $1 and u.is_active = true
      order by u.code
    `,
    [propertyId],
  )
  return result.rows
}

export type RunForMesaRow = {
  id: string
  status: string
  ordinary_total: string | null
  extraordinary_total: string | null
  previous_balance: string | null
  due_dates: any
}

export type RunForMesaItemRow = {
  id: string
  unit_id: string
  ordinary_amount: string | null
  extraordinary_amount: string | null
  particular_amount: string | null
  previous_balance: string | null
}

export async function getRunForPeriodFromPostgres(input: {
  managedPropertyId: string
  accountingPeriodId: string
}): Promise<RunForMesaRow | null> {
  const result = await pgQuery<RunForMesaRow>(
    `
      select id, status::text as status,
             ordinary_total::text as ordinary_total,
             extraordinary_total::text as extraordinary_total,
             previous_balance::text as previous_balance,
             due_dates
      from countrify.iadmin_liquidation_runs
      where managed_property_id = $1 and accounting_period_id = $2
      limit 1
    `,
    [input.managedPropertyId, input.accountingPeriodId],
  )
  return result.rows[0] ?? null
}

export async function listLiquidationItemsByRunBasicFromPostgres(
  runId: string,
): Promise<RunForMesaItemRow[]> {
  const result = await pgQuery<RunForMesaItemRow>(
    `
      select id, unit_id,
             ordinary_amount::text as ordinary_amount,
             extraordinary_amount::text as extraordinary_amount,
             particular_amount::text as particular_amount,
             previous_balance::text as previous_balance
      from countrify.iadmin_liquidation_items
      where liquidation_run_id = $1
    `,
    [runId],
  )
  return result.rows
}

/**
 * Suma del recargo por mora abierto agrupado por unidad para TODOS los runs
 * del consorcio EXCEPTO los del período indicado. Sirve para calcular el
 * `previous_balance` al emitir un nuevo período, arrastrando los recargos
 * acumulados de períodos anteriores.
 *
 * NOTA: los recargos viejos siguen vivos en el ledger atados a sus items
 * originales — no se voidean. Esto puede generar doble visualización
 * (aparecen tanto en account-statement de meses viejos como en
 * previous_balance del recibo nuevo), pero la lógica FIFO de aplicación de
 * pagos los resuelve correctamente: el pago contra el item nuevo se aplica
 * primero a los recargos viejos por antigüedad.
 */
export async function sumOpenLateFeesByUnitPriorPeriodsFromPostgres(input: {
  managedPropertyId: string
  excludePeriodId: string | null
}): Promise<Map<string, number>> {
  const result = await pgQuery<{ unit_id: string; total: string }>(
    `
      select li.unit_id, coalesce(sum(le.balance_open), 0)::text as total
      from countrify.iadmin_unit_ledger_entries le
      inner join countrify.iadmin_liquidation_items li on li.id = le.liquidation_item_id
      inner join countrify.iadmin_liquidation_runs r on r.id = le.liquidation_run_id
      where r.managed_property_id = $1
        and ($2::uuid is null or r.accounting_period_id <> $2::uuid)
        and le.entry_type = 'recargo_mora'
        and le.status in ('open', 'partially_paid')
        and le.superseded_by_item_id is null
      group by li.unit_id
      having coalesce(sum(le.balance_open), 0) > 0
    `,
    [input.managedPropertyId, input.excludePeriodId],
  )
  const map = new Map<string, number>()
  for (const r of result.rows) map.set(r.unit_id, Number(r.total))
  return map
}

/**
 * Suma del recargo por mora abierto (entry_type='recargo_mora', status
 * open|partially_paid) agrupado por unidad para todos los items de un run.
 * Devuelve sólo unidades con recargo > 0.
 */
export async function sumOpenLateFeesByUnitForRunFromPostgres(
  runId: string,
): Promise<Map<string, number>> {
  const result = await pgQuery<{ unit_id: string; total: string }>(
    `
      select li.unit_id, coalesce(sum(le.balance_open), 0)::text as total
      from countrify.iadmin_unit_ledger_entries le
      inner join countrify.iadmin_liquidation_items li on li.id = le.liquidation_item_id
      where le.liquidation_run_id = $1
        and le.entry_type = 'recargo_mora'
        and le.status in ('open', 'partially_paid')
        and le.superseded_by_item_id is null
      group by li.unit_id
      having coalesce(sum(le.balance_open), 0) > 0
    `,
    [runId],
  )
  const map = new Map<string, number>()
  for (const r of result.rows) map.set(r.unit_id, Number(r.total))
  return map
}

export async function getMostRecentIssuedPriorRunItemsFromPostgres(input: {
  managedPropertyId: string
  excludePeriodId: string | null
}): Promise<RunForMesaItemRow[]> {
  const result = await pgQuery<RunForMesaItemRow>(
    `
      with prior_run as (
        select id from countrify.iadmin_liquidation_runs
        where managed_property_id = $1
          and ($2::uuid is null or accounting_period_id <> $2)
          and status in ('issued', 'closed')
        order by generated_at desc
        limit 1
      )
      select i.id, i.unit_id,
             i.ordinary_amount::text as ordinary_amount,
             i.extraordinary_amount::text as extraordinary_amount,
             i.particular_amount::text as particular_amount,
             i.previous_balance::text as previous_balance
      from countrify.iadmin_liquidation_items i
      where i.liquidation_run_id in (select id from prior_run)
    `,
    [input.managedPropertyId, input.excludePeriodId],
  )
  return result.rows
}

export async function sumLivePaymentsByUnitForItemsFromPostgres(
  itemIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (itemIds.length === 0) return out
  const result = await pgQuery<{ unit_id: string | null; amount: string }>(
    `
      select unit_id, amount::text as amount
      from countrify.iadmin_payments
      where liquidation_item_id = any($1::uuid[]) and is_void = false
    `,
    [itemIds],
  )
  for (const row of result.rows) {
    if (!row.unit_id) continue
    out.set(row.unit_id, (out.get(row.unit_id) ?? 0) + Number(row.amount))
  }
  return out
}

export async function sumImputedTotalsForPeriodFromPostgres(input: {
  managedPropertyId: string
  accountingPeriodId: string
}): Promise<{ ord_total: string; ext_total: string }> {
  const result = await pgQuery<{ ord_total: string; ext_total: string }>(
    `
      select
        coalesce(sum(case when expense_kind::text = 'extraordinaria' then 0 else amount end), 0)::text as ord_total,
        coalesce(sum(case when expense_kind::text = 'extraordinaria' then amount else 0 end), 0)::text as ext_total
      from countrify.iadmin_expenses
      where managed_property_id = $1 and accounting_period_id = $2 and status = 'imputed'
    `,
    [input.managedPropertyId, input.accountingPeriodId],
  )
  return result.rows[0] ?? { ord_total: '0', ext_total: '0' }
}

// ----------------------------------------------------------------------------
// Monthly grid (planilla 12 meses)
// ----------------------------------------------------------------------------

export type ProviderBasicRow = {
  id: string
  administration_id: string
  name: string
  category: string | null
  default_category: string | null
  default_description: string | null
  email: string | null
  phone: string | null
  tax_id: string | null
  notes: string | null
  is_recurring: boolean
  recurring_amount: string | null
  recurring_kind: string | null
  is_active: boolean
  created_at: string
}

export async function listActiveProvidersForGridFromPostgres(
  administrationId: string,
): Promise<ProviderBasicRow[]> {
  const result = await pgQuery<ProviderBasicRow>(
    `
      select id, administration_id, name, category, default_category, default_description,
             email, phone, tax_id, notes, is_recurring,
             recurring_amount::text as recurring_amount,
             recurring_kind::text as recurring_kind,
             is_active, created_at::text as created_at
      from countrify.iadmin_providers
      where administration_id = $1 and is_active = true
    `,
    [administrationId],
  )
  return result.rows
}

export type GridExpenseRawRow = {
  id: string
  amount: string
  provider_id: string | null
  accounting_period_id: string
  status: string
  expense_kind: string | null
  description: string | null
  issued_at: string | null
  created_at: string | null
  updated_at: string | null
  created_by: string | null
  period_year: number | null
  period_month: number | null
  first_doc_id: string | null
  first_doc_name: string | null
  first_doc_path: string | null
  doc_count: number
}

export async function listExpensesForGridFromPostgres(input: {
  managedPropertyId: string
  fromYear: number
}): Promise<GridExpenseRawRow[]> {
  const result = await pgQuery<GridExpenseRawRow>(
    `
      with first_doc as (
        select distinct on (expense_id)
          expense_id, id as doc_id, file_name, storage_path
        from countrify.iadmin_expense_documents
        order by expense_id, uploaded_at asc
      ),
      doc_count as (
        select expense_id, count(*)::int as c
        from countrify.iadmin_expense_documents
        group by expense_id
      )
      select
        e.id, e.amount::text as amount, e.provider_id, e.accounting_period_id,
        e.status::text as status, e.expense_kind::text as expense_kind,
        e.description, e.issued_at::text as issued_at,
        e.created_at::text as created_at, e.updated_at::text as updated_at,
        e.created_by,
        ap.period_year, ap.period_month,
        fd.doc_id as first_doc_id, fd.file_name as first_doc_name, fd.storage_path as first_doc_path,
        coalesce(dc.c, 0) as doc_count
      from countrify.iadmin_expenses e
      inner join countrify.iadmin_accounting_periods ap on ap.id = e.accounting_period_id
      left join first_doc fd on fd.expense_id = e.id
      left join doc_count dc on dc.expense_id = e.id
      where e.managed_property_id = $1
        and ap.period_year >= $2
    `,
    [input.managedPropertyId, input.fromYear],
  )
  return result.rows
}

export type GridRunRow = {
  id: string
  status: string
  period_year: number | null
  period_month: number | null
}

export async function listRunsForGridFromPostgres(
  propertyId: string,
): Promise<GridRunRow[]> {
  const result = await pgQuery<GridRunRow>(
    `
      select r.id, r.status::text as status,
             ap.period_year, ap.period_month
      from countrify.iadmin_liquidation_runs r
      left join countrify.iadmin_accounting_periods ap on ap.id = r.accounting_period_id
      where r.managed_property_id = $1
    `,
    [propertyId],
  )
  return result.rows
}

export type UnitProrataRow = { id: string; prorata_coefficient: string | null }

export async function listActiveUnitsProrataFromPostgres(
  propertyId: string,
): Promise<UnitProrataRow[]> {
  const result = await pgQuery<UnitProrataRow>(
    `select id, prorata_coefficient::text as prorata_coefficient from countrify.iadmin_units where managed_property_id = $1 and is_active = true`,
    [propertyId],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Closing checklist (cierre del periodo)
// ----------------------------------------------------------------------------

export type ExpenseCountByStatusRow = {
  total: number
  pending_count: number
}

export async function countExpensesForPeriodFromPostgres(input: {
  managedPropertyId: string
  accountingPeriodId: string
}): Promise<ExpenseCountByStatusRow> {
  const result = await pgQuery<ExpenseCountByStatusRow>(
    `
      select
        count(*)::int as total,
        count(*) filter (where status in ('pending_review', 'needs_doc'))::int as pending_count
      from countrify.iadmin_expenses
      where managed_property_id = $1 and accounting_period_id = $2
    `,
    [input.managedPropertyId, input.accountingPeriodId],
  )
  return result.rows[0] ?? { total: 0, pending_count: 0 }
}

export async function getRunIdAndStatusForPeriodFromPostgres(input: {
  managedPropertyId: string
  accountingPeriodId: string
}): Promise<{ id: string; status: string } | null> {
  const result = await pgQuery<{ id: string; status: string }>(
    `select id, status::text as status from countrify.iadmin_liquidation_runs where managed_property_id = $1 and accounting_period_id = $2 limit 1`,
    [input.managedPropertyId, input.accountingPeriodId],
  )
  return result.rows[0] ?? null
}

export async function countRemindersGeneratedSinceFromPostgres(input: {
  managedPropertyId: string
  sinceTimestamp: string
}): Promise<number> {
  const result = await pgQuery<{ c: number }>(
    `select count(*)::int as c from countrify.iadmin_reminders where managed_property_id = $1 and generated_at >= $2::timestamptz`,
    [input.managedPropertyId, input.sinceTimestamp],
  )
  return result.rows[0]?.c ?? 0
}

export async function countNotificationsSinceForAdminFromPostgres(input: {
  administrationId: string
  sinceTimestamp: string
}): Promise<number> {
  const result = await pgQuery<{ c: number }>(
    `select count(*)::int as c from countrify.iadmin_notifications where administration_id = $1 and created_at >= $2::timestamptz`,
    [input.administrationId, input.sinceTimestamp],
  )
  return result.rows[0]?.c ?? 0
}

// ----------------------------------------------------------------------------
// Unit account statement (vecino: estado de cuenta)
// ----------------------------------------------------------------------------

export type UnitWithAdminHolderRow = {
  id: string
  code: string
  kind: string
  prorata_coefficient: string | null
  managed_property_id: string
  administration_id: string
  holder_full_name: string | null
  holder_phone: string | null
  holder_email: string | null
}

export async function getUnitWithAdminAndHolderFromPostgres(input: {
  unitId: string
  managedPropertyId: string
}): Promise<UnitWithAdminHolderRow | null> {
  const result = await pgQuery<UnitWithAdminHolderRow>(
    `
      with chosen_holder as (
        select distinct on (unit_id)
          unit_id, full_name, phone, email, is_active
        from countrify.iadmin_unit_holders
        order by unit_id, is_active desc, created_at asc
      )
      select
        u.id, u.code, u.kind::text as kind,
        u.prorata_coefficient::text as prorata_coefficient,
        u.managed_property_id, mp.administration_id,
        ch.full_name as holder_full_name,
        ch.phone as holder_phone,
        ch.email as holder_email
      from countrify.iadmin_units u
      inner join countrify.iadmin_managed_properties mp on mp.id = u.managed_property_id
      left join chosen_holder ch on ch.unit_id = u.id
      where u.id = $1 and u.managed_property_id = $2
      limit 1
    `,
    [input.unitId, input.managedPropertyId],
  )
  return result.rows[0] ?? null
}

export type AccountingPeriodWindowRow = {
  id: string
  period_year: number
  period_month: number
  status: string
}

/**
 * Períodos contables distintos que tienen al menos una propiedad activa de la
 * administración. Sirve para selectores de período a nivel admin (ej. Inicio).
 */
export async function listAdministrationAccountingPeriodsFromPostgres(
  administrationId: string,
): Promise<Array<{ period_year: number; period_month: number }>> {
  const result = await pgQuery<{ period_year: number; period_month: number }>(
    `
      select distinct ap.period_year, ap.period_month
      from countrify.iadmin_accounting_periods ap
      inner join countrify.iadmin_managed_properties mp on mp.id = ap.managed_property_id
      where mp.administration_id = $1
        and mp.is_active = true
      order by ap.period_year desc, ap.period_month desc
    `,
    [administrationId],
  )
  return result.rows
}

/**
 * Listado simple de todos los períodos existentes para un consorcio, orden
 * descendente (mas reciente primero). Lo usamos en filtros de UI.
 */
export async function listAllAccountingPeriodsFromPostgres(
  managedPropertyId: string,
): Promise<Array<{ period_year: number; period_month: number; status: string }>> {
  const result = await pgQuery<{ period_year: number; period_month: number; status: string }>(
    `
      select period_year, period_month, status::text as status
      from countrify.iadmin_accounting_periods
      where managed_property_id = $1
      order by period_year desc, period_month desc
    `,
    [managedPropertyId],
  )
  return result.rows
}

export async function listAccountingPeriodsByYearsFromPostgres(input: {
  managedPropertyId: string
  years: number[]
}): Promise<AccountingPeriodWindowRow[]> {
  if (input.years.length === 0) return []
  const result = await pgQuery<AccountingPeriodWindowRow>(
    `
      select id, period_year, period_month, status::text as status
      from countrify.iadmin_accounting_periods
      where managed_property_id = $1 and period_year = any($2::int[])
    `,
    [input.managedPropertyId, input.years],
  )
  return result.rows
}

export type RunWithUnitItemRow = {
  run_id: string
  run_status: string
  period_year: number | null
  period_month: number | null
  item_id: string | null
  ordinary_amount: string | null
  extraordinary_amount: string | null
  previous_balance: string | null
}

export async function listRunsWithUnitItemFromPostgres(input: {
  managedPropertyId: string
  unitId: string
}): Promise<RunWithUnitItemRow[]> {
  const result = await pgQuery<RunWithUnitItemRow>(
    `
      select
        r.id as run_id,
        r.status::text as run_status,
        ap.period_year,
        ap.period_month,
        i.id as item_id,
        i.ordinary_amount::text as ordinary_amount,
        i.extraordinary_amount::text as extraordinary_amount,
        i.previous_balance::text as previous_balance
      from countrify.iadmin_liquidation_runs r
      left join countrify.iadmin_accounting_periods ap on ap.id = r.accounting_period_id
      left join countrify.iadmin_liquidation_items i on i.liquidation_run_id = r.id and i.unit_id = $2
      where r.managed_property_id = $1
    `,
    [input.managedPropertyId, input.unitId],
  )
  return result.rows
}

export type ImputedTotalsByPeriodRow = {
  accounting_period_id: string
  ord_total: string
  ext_total: string
}

export async function sumImputedExpensesByPeriodsFromPostgres(input: {
  managedPropertyId: string
  periodIds: string[]
}): Promise<ImputedTotalsByPeriodRow[]> {
  if (input.periodIds.length === 0) return []
  const result = await pgQuery<ImputedTotalsByPeriodRow>(
    `
      select
        accounting_period_id,
        coalesce(sum(case when (expense_kind::text = 'extraordinaria') then 0 else amount end), 0)::text as ord_total,
        coalesce(sum(case when (expense_kind::text = 'extraordinaria') then amount else 0 end), 0)::text as ext_total
      from countrify.iadmin_expenses
      where managed_property_id = $1
        and status = 'imputed'
        and accounting_period_id = any($2::uuid[])
      group by accounting_period_id
    `,
    [input.managedPropertyId, input.periodIds],
  )
  return result.rows
}

export type UnitPaymentRow = {
  id: string
  amount: string
  paid_at: string
  method: string | null
  reference: string | null
  receipt_number: string | null
  due_label: string | null
  surcharge_amount: string | null
  is_void: boolean
  notes: string | null
  liquidation_run_id: string | null
  liquidation_item_id: string | null
  period_year: number | null
  period_month: number | null
}

export async function listUnitPaymentsInWindowFromPostgres(input: {
  unitId: string
  windowStart: string
}): Promise<UnitPaymentRow[]> {
  const result = await pgQuery<UnitPaymentRow>(
    `
      select
        p.id, p.amount::text as amount, p.paid_at::text as paid_at,
        p.method, p.reference, p.receipt_number, p.due_label,
        p.surcharge_amount::text as surcharge_amount,
        p.is_void, p.notes,
        p.liquidation_run_id, p.liquidation_item_id,
        ap.period_year, ap.period_month
      from countrify.iadmin_payments p
      left join countrify.iadmin_liquidation_runs r on r.id = p.liquidation_run_id
      left join countrify.iadmin_accounting_periods ap on ap.id = r.accounting_period_id
      where p.unit_id = $1 and p.paid_at >= $2::date
      order by p.paid_at desc
    `,
    [input.unitId, input.windowStart],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Lista de liquidation runs para un administrador (resumen)
// ----------------------------------------------------------------------------

export type LiquidationRunSummaryRow = {
  id: string
  managed_property_id: string
  property_display_name: string | null
  building_name: string | null
  period_year: number | null
  period_month: number | null
  status: string
  total_expenses: string | null
  total_units: number | null
  generated_at: string
  closed_at: string | null
}

export async function listLiquidationRunSummariesByAdminFromPostgres(input: {
  administrationId: string
  limit: number
}): Promise<LiquidationRunSummaryRow[]> {
  const result = await pgQuery<LiquidationRunSummaryRow>(
    `
      select
        r.id, r.managed_property_id,
        mp.display_name as property_display_name,
        b.name as building_name,
        ap.period_year, ap.period_month,
        r.status::text as status,
        r.total_expenses::text as total_expenses,
        r.total_units,
        r.generated_at::text as generated_at,
        r.closed_at::text as closed_at
      from countrify.iadmin_liquidation_runs r
      left join countrify.iadmin_managed_properties mp on mp.id = r.managed_property_id
      left join countrify.buildings b on b.id = mp.building_id
      left join countrify.iadmin_accounting_periods ap on ap.id = r.accounting_period_id
      where r.administration_id = $1
      order by r.generated_at desc
      limit $2
    `,
    [input.administrationId, input.limit],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Liquidation run detail (run + admin + property + period + profiles)
// ----------------------------------------------------------------------------

export type LiquidationRunHeaderRow = {
  id: string
  administration_id: string
  managed_property_id: string
  accounting_period_id: string
  status: string
  total_expenses: string | null
  ordinary_total: string | null
  extraordinary_total: string | null
  previous_balance: string | null
  due_dates: any
  total_units: number | null
  generated_at: string
  generated_by_name: string | null
  issued_at: string | null
  issued_by_name: string | null
  closed_at: string | null
  closed_by_name: string | null
  administration_name: string
  administration_legal_info: any
  property_display_name: string | null
  property_legal_info: any
  building_name: string | null
  building_address: string | null
  period_year: number | null
  period_month: number | null
}

export async function getLiquidationRunHeaderFromPostgres(
  runId: string,
): Promise<LiquidationRunHeaderRow | null> {
  const result = await pgQuery<LiquidationRunHeaderRow>(
    `
      select
        r.id,
        r.administration_id,
        r.managed_property_id,
        r.accounting_period_id,
        r.status::text as status,
        r.total_expenses::text as total_expenses,
        r.ordinary_total::text as ordinary_total,
        r.extraordinary_total::text as extraordinary_total,
        r.previous_balance::text as previous_balance,
        r.due_dates,
        r.total_units,
        r.generated_at::text as generated_at,
        gp.full_name as generated_by_name,
        r.issued_at::text as issued_at,
        ip.full_name as issued_by_name,
        r.closed_at::text as closed_at,
        cp.full_name as closed_by_name,
        a.name as administration_name,
        a.legal_info as administration_legal_info,
        mp.display_name as property_display_name,
        mp.legal_info as property_legal_info,
        b.name as building_name,
        b.address as building_address,
        ap.period_year,
        ap.period_month
      from countrify.iadmin_liquidation_runs r
      inner join countrify.iadmin_administrations a on a.id = r.administration_id
      inner join countrify.iadmin_managed_properties mp on mp.id = r.managed_property_id
      inner join countrify.buildings b on b.id = mp.building_id
      left join countrify.iadmin_accounting_periods ap on ap.id = r.accounting_period_id
      left join countrify.profiles gp on gp.id = r.generated_by
      left join countrify.profiles ip on ip.id = r.issued_by
      left join countrify.profiles cp on cp.id = r.closed_by
      where r.id = $1
      limit 1
    `,
    [runId],
  )
  return result.rows[0] ?? null
}

export type LiquidationItemDetailRow = {
  id: string
  unit_id: string
  prorata_coefficient: string | null
  amount: string | null
  ordinary_amount: string | null
  extraordinary_amount: string | null
  previous_balance: string | null
  particular_amount: string | null
  unit_code: string | null
  unit_kind: string | null
  active_holder_full_name: string | null
  active_holder_kind: string | null
}

export async function listLiquidationItemsDetailedFromPostgres(
  runId: string,
): Promise<LiquidationItemDetailRow[]> {
  const result = await pgQuery<LiquidationItemDetailRow>(
    `
      with chosen_holder as (
        select distinct on (unit_id)
          unit_id, full_name, holder_kind::text as holder_kind, is_active
        from countrify.iadmin_unit_holders
        order by unit_id, is_active desc, created_at asc
      )
      select
        i.id,
        i.unit_id,
        i.prorata_coefficient::text as prorata_coefficient,
        i.amount::text as amount,
        i.ordinary_amount::text as ordinary_amount,
        i.extraordinary_amount::text as extraordinary_amount,
        i.previous_balance::text as previous_balance,
        i.particular_amount::text as particular_amount,
        u.code as unit_code,
        u.kind::text as unit_kind,
        ch.full_name as active_holder_full_name,
        ch.holder_kind as active_holder_kind
      from countrify.iadmin_liquidation_items i
      left join countrify.iadmin_units u on u.id = i.unit_id
      left join chosen_holder ch on ch.unit_id = u.id
      where i.liquidation_run_id = $1
    `,
    [runId],
  )
  return result.rows
}

export type PaymentDetailRow = {
  id: string
  administration_id: string
  managed_property_id: string
  liquidation_run_id: string | null
  liquidation_item_id: string | null
  unit_id: string | null
  unit_code: string | null
  cash_account_id: string | null
  cash_account_name: string | null
  bank_movement_id: string | null
  amount: string
  surcharge_amount: string | null
  paid_at: string
  method: string | null
  reference: string | null
  receipt_number: string | null
  due_label: string | null
  notes: string | null
  is_void: boolean
  voided_at: string | null
  void_reason: string | null
  created_at: string
}

export async function listLivePaymentsByRunDetailedFromPostgres(
  runId: string,
): Promise<PaymentDetailRow[]> {
  const result = await pgQuery<PaymentDetailRow>(
    `
      select
        p.id, p.administration_id, p.managed_property_id, p.liquidation_run_id,
        p.liquidation_item_id, p.unit_id, u.code as unit_code,
        p.cash_account_id, ca.name as cash_account_name,
        p.bank_movement_id, p.amount::text as amount,
        p.surcharge_amount::text as surcharge_amount,
        p.paid_at::text as paid_at, p.method, p.reference, p.receipt_number,
        p.due_label, p.notes, p.is_void,
        p.voided_at::text as voided_at, p.void_reason, p.created_at::text as created_at
      from countrify.iadmin_payments p
      left join countrify.iadmin_cash_accounts ca on ca.id = p.cash_account_id
      left join countrify.iadmin_units u on u.id = p.unit_id
      where p.liquidation_run_id = $1 and p.is_void = false
      order by p.paid_at desc
    `,
    [runId],
  )
  return result.rows
}

export type ExpenseLineForRunRow = {
  id: string
  description: string
  amount: string
  category: string | null
  issued_at: string | null
  expense_kind: string | null
  provider_name: string | null
  document_type: string | null
  document_number: string | null
}

export async function listImputedExpenseLinesByPeriodFromPostgres(
  accountingPeriodId: string,
): Promise<ExpenseLineForRunRow[]> {
  const result = await pgQuery<ExpenseLineForRunRow>(
    `
      select
        e.id, e.description, e.amount::text as amount, e.category,
        e.issued_at::text as issued_at, e.expense_kind::text as expense_kind,
        e.document_type, e.document_number,
        p.name as provider_name
      from countrify.iadmin_expenses e
      left join countrify.iadmin_providers p on p.id = e.provider_id
      where e.accounting_period_id = $1 and e.status = 'imputed'
      order by e.issued_at asc
    `,
    [accountingPeriodId],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Units with holders + memberships (con profile mínimo)
// ----------------------------------------------------------------------------

export type UnitFullRow = {
  id: string
  managed_property_id: string
  code: string
  kind: string
  floor: string | null
  surface_m2: string | null
  prorata_coefficient: string | null
  is_active: boolean
  created_at: string
}

export async function listUnitsBasicByPropertyFromPostgres(
  propertyId: string,
): Promise<UnitFullRow[]> {
  const result = await pgQuery<UnitFullRow>(
    `
      select id, managed_property_id, code, kind::text as kind, floor,
             surface_m2::text as surface_m2, prorata_coefficient::text as prorata_coefficient,
             is_active, created_at::text as created_at
      from countrify.iadmin_units
      where managed_property_id = $1
      order by code
    `,
    [propertyId],
  )
  return result.rows
}

export type HolderRow = {
  id: string
  unit_id: string
  profile_id: string | null
  full_name: string
  holder_kind: string
  tax_id: string | null
  email: string | null
  phone: string | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
  created_at: string
}

export async function listHoldersByUnitsFromPostgres(unitIds: string[]): Promise<HolderRow[]> {
  if (unitIds.length === 0) return []
  const result = await pgQuery<HolderRow>(
    `
      select id, unit_id, profile_id, full_name, holder_kind::text as holder_kind,
             tax_id, email, phone,
             start_date::text as start_date, end_date::text as end_date,
             is_active, created_at::text as created_at
      from countrify.iadmin_unit_holders
      where unit_id = any($1::uuid[])
    `,
    [unitIds],
  )
  return result.rows
}

export type MembershipWithProfileRow = {
  id: string
  unit_id: string
  building_id: string
  profile_id: string
  relationship_type: string
  is_primary: boolean
  active: boolean
  created_at: string
  created_by_profile_id: string | null
  profile_email: string | null
  profile_full_name: string | null
  profile_role: string | null
  profile_floor: string | null
  profile_unit: string | null
}

export async function listMembershipsWithProfileByUnitsFromPostgres(
  unitIds: string[],
): Promise<MembershipWithProfileRow[]> {
  if (unitIds.length === 0) return []
  const result = await pgQuery<MembershipWithProfileRow>(
    `
      select
        m.id, m.unit_id, m.building_id, m.profile_id,
        m.relationship_type::text as relationship_type,
        m.is_primary, m.active,
        m.created_at::text as created_at,
        m.created_by_profile_id,
        p.email as profile_email,
        p.full_name as profile_full_name,
        p.role::text as profile_role,
        p.floor as profile_floor,
        p.unit as profile_unit
      from countrify.unit_profile_memberships m
      left join countrify.profiles p on p.id = m.profile_id
      where m.unit_id = any($1::uuid[])
    `,
    [unitIds],
  )
  return result.rows
}

export async function getExpensePaymentInfoFromPostgres(
  expenseId: string,
): Promise<ExpensePaymentRow | null> {
  const result = await pgQuery<ExpensePaymentRow>(
    `
      select m.movement_date::text as movement_date, ca.name as cash_account_name
      from countrify.iadmin_bank_movements m
      left join countrify.iadmin_cash_accounts ca on ca.id = m.cash_account_id
      where m.expense_id = $1 and m.movement_kind = 'expense_payment'
      limit 1
    `,
    [expenseId],
  )
  return result.rows[0] ?? null
}

// ----------------------------------------------------------------------------
// Cobranzas — listado de pagos, items abiertos y KPIs por administracion.
// ----------------------------------------------------------------------------

export type CollectionPaymentRow = {
  id: string
  administration_id: string
  managed_property_id: string
  property_display_name: string | null
  building_name: string | null
  liquidation_run_id: string | null
  liquidation_item_id: string | null
  period_year: number | null
  period_month: number | null
  unit_id: string | null
  unit_code: string | null
  holder_name: string | null
  cash_account_id: string | null
  cash_account_name: string | null
  bank_movement_id: string | null
  amount: string
  surcharge_amount: string
  paid_at: string
  method: string | null
  reference: string | null
  receipt_number: string | null
  due_label: string | null
  notes: string | null
  is_void: boolean
  voided_at: string | null
  voided_by: string | null
  voided_by_name: string | null
  void_reason: string | null
  created_at: string
  created_by: string | null
  created_by_name: string | null
}

export async function listPaymentsByAdminFromPostgres(input: {
  administrationId: string
  periodYear?: number | null
  periodMonth?: number | null
  unitId?: string | null
  status?: 'live' | 'voided' | 'all'
  method?: string | null
  limit?: number
}): Promise<CollectionPaymentRow[]> {
  const status = input.status ?? 'live'
  const limit = input.limit ?? 200

  const result = await pgQuery<CollectionPaymentRow>(
    `
      with chosen_holder as (
        select distinct on (unit_id) unit_id, full_name
          from countrify.iadmin_unit_holders
         order by unit_id, is_active desc, created_at asc
      )
      select
        p.id,
        p.administration_id,
        p.managed_property_id,
        mp.display_name as property_display_name,
        b.name as building_name,
        p.liquidation_run_id,
        p.liquidation_item_id,
        ap.period_year,
        ap.period_month,
        p.unit_id,
        u.code as unit_code,
        ch.full_name as holder_name,
        p.cash_account_id,
        ca.name as cash_account_name,
        p.bank_movement_id,
        p.amount::text as amount,
        coalesce(p.surcharge_amount, 0)::text as surcharge_amount,
        p.paid_at::text as paid_at,
        p.method,
        p.reference,
        p.receipt_number,
        p.due_label,
        p.notes,
        p.is_void,
        p.voided_at::text as voided_at,
        p.voided_by,
        prv.full_name as voided_by_name,
        p.void_reason,
        p.created_at::text as created_at,
        p.created_by,
        prc.full_name as created_by_name
      from countrify.iadmin_payments p
      left join countrify.iadmin_units u on u.id = p.unit_id
      left join chosen_holder ch on ch.unit_id = u.id
      left join countrify.iadmin_cash_accounts ca on ca.id = p.cash_account_id
      left join countrify.iadmin_managed_properties mp on mp.id = p.managed_property_id
      left join countrify.buildings b on b.id = mp.building_id
      left join countrify.iadmin_liquidation_runs r on r.id = p.liquidation_run_id
      left join countrify.iadmin_accounting_periods ap on ap.id = r.accounting_period_id
      left join countrify.profiles prv on prv.id = p.voided_by
      left join countrify.profiles prc on prc.id = p.created_by
      where p.administration_id = $1
        and ($2::int is null or ap.period_year = $2)
        and ($3::int is null or ap.period_month = $3)
        and ($4::uuid is null or p.unit_id = $4)
        and ($5::text = 'all' or ($5::text = 'live' and p.is_void = false) or ($5::text = 'voided' and p.is_void = true))
        and ($6::text is null or p.method = $6)
      order by p.paid_at desc, p.created_at desc
      limit $7
    `,
    [
      input.administrationId,
      input.periodYear ?? null,
      input.periodMonth ?? null,
      input.unitId ?? null,
      status,
      input.method ?? null,
      limit,
    ],
  )
  return result.rows
}

export type OpenLiquidationItemRow = {
  item_id: string
  unit_id: string
  unit_code: string
  unit_kind: string | null
  holder_name: string | null
  managed_property_id: string
  property_display_name: string | null
  building_name: string | null
  liquidation_run_id: string
  run_status: string
  period_year: number
  period_month: number
  ordinary_amount: string
  extraordinary_amount: string
  previous_balance: string
  subtotal: string
  paid: string
  balance_remaining: string
  due_dates: unknown
}

export async function listOpenLiquidationItemsByAdminFromPostgres(input: {
  administrationId: string
}): Promise<OpenLiquidationItemRow[]> {
  const result = await pgQuery<OpenLiquidationItemRow>(
    `
      with chosen_holder as (
        select distinct on (unit_id) unit_id, full_name
          from countrify.iadmin_unit_holders
         order by unit_id, is_active desc, created_at asc
      ),
      ledger_by_item as (
        select
          liquidation_item_id,
          unit_id,
          liquidation_run_id,
          sum(case when entry_type = 'expensa_ordinaria' then amount else 0 end) as ordinary_amount,
          sum(case when entry_type = 'expensa_extraordinaria' then amount else 0 end) as extraordinary_amount,
          sum(case when entry_type in ('saldo_anterior_migrado', 'recargo_mora', 'ajuste_manual') then amount else 0 end) as previous_balance,
          sum(amount) as subtotal,
          sum(balance_open) as balance_remaining
        from countrify.iadmin_unit_ledger_entries
        where administration_id = $1
          and liquidation_item_id is not null
          and entry_type <> 'pago'
          and status <> 'void'
        group by liquidation_item_id, unit_id, liquidation_run_id
      )
      select
        li.id as item_id,
        li.unit_id,
        u.code as unit_code,
        u.kind::text as unit_kind,
        ch.full_name as holder_name,
        r.managed_property_id,
        mp.display_name as property_display_name,
        b.name as building_name,
        r.id as liquidation_run_id,
        r.status::text as run_status,
        ap.period_year,
        ap.period_month,
        coalesce(lbi.ordinary_amount, 0)::text as ordinary_amount,
        coalesce(lbi.extraordinary_amount, 0)::text as extraordinary_amount,
        coalesce(lbi.previous_balance, 0)::text as previous_balance,
        coalesce(lbi.subtotal, 0)::text as subtotal,
        greatest(0, coalesce(lbi.subtotal, 0) - coalesce(lbi.balance_remaining, 0))::text as paid,
        coalesce(lbi.balance_remaining, 0)::text as balance_remaining,
        r.due_dates as due_dates
      from countrify.iadmin_liquidation_items li
      inner join countrify.iadmin_liquidation_runs r on r.id = li.liquidation_run_id
      inner join countrify.iadmin_accounting_periods ap on ap.id = r.accounting_period_id
      inner join countrify.iadmin_managed_properties mp on mp.id = r.managed_property_id
      inner join countrify.buildings b on b.id = mp.building_id
      inner join countrify.iadmin_units u on u.id = li.unit_id
      left join chosen_holder ch on ch.unit_id = u.id
      left join ledger_by_item lbi on lbi.liquidation_item_id = li.id
      where r.administration_id = $1
        and r.status in ('issued', 'closed')
        and coalesce(lbi.balance_remaining, 0) > 0.01
      order by ap.period_year desc, ap.period_month desc, u.code asc
    `,
    [input.administrationId],
  )
  return result.rows
}

export type CollectionsKpisRow = {
  collected_this_month: string
  payments_this_month: number
  open_balance_total: string
  overdue_over_30d: string
}

export async function computeCollectionsKpisFromPostgres(input: {
  administrationId: string
}): Promise<CollectionsKpisRow> {
  const result = await pgQuery<CollectionsKpisRow>(
    `
      with month_bounds as (
        select date_trunc('month', now())::date as start_of_month
      ),
      live_payments as (
        select p.*
          from countrify.iadmin_payments p
         where p.administration_id = $1
           and p.is_void = false
      ),
      this_month as (
        select
          coalesce(sum(amount), 0)::text as collected_this_month,
          count(*)::int as payments_this_month
        from live_payments, month_bounds
        where paid_at >= month_bounds.start_of_month
      ),
      open_entries as (
        select
          due_date,
          balance_open
        from countrify.iadmin_unit_ledger_entries
        where administration_id = $1
          and status in ('open', 'partially_paid')
          and entry_type <> 'pago'
      )
      select
        (select collected_this_month from this_month) as collected_this_month,
        (select payments_this_month from this_month) as payments_this_month,
        coalesce((select sum(balance_open) from open_entries), 0)::text as open_balance_total,
        coalesce(
          (select sum(balance_open)
             from open_entries
            where due_date is not null
              and due_date < (now() - interval '30 days')::date),
          0
        )::text as overdue_over_30d
    `,
    [input.administrationId],
  )
  return result.rows[0]
}

// ----------------------------------------------------------------------------
// Morosos: agregacion por unidad (todos los items abiertos sumados)
// ----------------------------------------------------------------------------

export type MorosoUnitRow = {
  unit_id: string
  unit_code: string
  unit_kind: string | null
  holder_name: string | null
  holder_email: string | null
  holder_phone: string | null
  managed_property_id: string
  property_display_name: string | null
  building_name: string | null
  open_items_count: number
  total_balance: string
  // Buckets de aging (basados en primer vencimiento del item):
  bucket_current: string // todavia no vencio
  bucket_0_30: string // venc <= 30 dias atras
  bucket_31_60: string // venc 31-60 dias atras
  bucket_61_90: string // venc 61-90 dias atras
  bucket_over_90: string // venc mas de 90 dias atras
  oldest_due_date: string | null
  last_payment_at: string | null
}

export async function listMorososByAdminFromPostgres(input: {
  administrationId: string
}): Promise<MorosoUnitRow[]> {
  const result = await pgQuery<MorosoUnitRow>(
    `
      with chosen_holder as (
        select distinct on (h.unit_id)
          h.unit_id, h.full_name, h.email, h.phone
        from countrify.iadmin_unit_holders h
        order by h.unit_id, h.is_active desc, h.created_at asc
      ),
      open_entries as (
        select
          le.id as item_id,
          le.unit_id,
          le.managed_property_id,
          le.balance_open as balance,
          le.due_date as first_due_date
        from countrify.iadmin_unit_ledger_entries le
        where le.administration_id = $1
          and le.status in ('open', 'partially_paid')
          and le.entry_type <> 'pago'
      ),
      bucketed as (
        select
          oe.unit_id,
          oe.managed_property_id,
          oe.balance,
          oe.first_due_date,
          case
            when oe.first_due_date is null then null
            else (current_date - oe.first_due_date)
          end as days_overdue
        from open_entries oe
      ),
      last_pay as (
        select unit_id, max(paid_at) as last_paid_at
          from countrify.iadmin_payments
         where administration_id = $1 and is_void = false
         group by unit_id
      ),
      agg as (
        select
          b.unit_id,
          b.managed_property_id,
          count(*)::int as open_items_count,
          sum(b.balance) as total_balance,
          sum(case when b.days_overdue is null or b.days_overdue < 0 then b.balance else 0 end) as bucket_current,
          sum(case when b.days_overdue between 0 and 30 then b.balance else 0 end) as bucket_0_30,
          sum(case when b.days_overdue between 31 and 60 then b.balance else 0 end) as bucket_31_60,
          sum(case when b.days_overdue between 61 and 90 then b.balance else 0 end) as bucket_61_90,
          sum(case when b.days_overdue > 90 then b.balance else 0 end) as bucket_over_90,
          min(b.first_due_date) as oldest_due_date
        from bucketed b
        group by b.unit_id, b.managed_property_id
      )
      select
        a.unit_id,
        u.code as unit_code,
        u.kind::text as unit_kind,
        ch.full_name as holder_name,
        ch.email as holder_email,
        ch.phone as holder_phone,
        a.managed_property_id,
        mp.display_name as property_display_name,
        b.name as building_name,
        a.open_items_count,
        a.total_balance::text as total_balance,
        a.bucket_current::text as bucket_current,
        a.bucket_0_30::text as bucket_0_30,
        a.bucket_31_60::text as bucket_31_60,
        a.bucket_61_90::text as bucket_61_90,
        a.bucket_over_90::text as bucket_over_90,
        a.oldest_due_date::text as oldest_due_date,
        lp.last_paid_at::text as last_payment_at
      from agg a
      inner join countrify.iadmin_units u on u.id = a.unit_id
      left join chosen_holder ch on ch.unit_id = a.unit_id
      inner join countrify.iadmin_managed_properties mp on mp.id = a.managed_property_id
      inner join countrify.buildings b on b.id = mp.building_id
      left join last_pay lp on lp.unit_id = a.unit_id
      order by a.total_balance desc
    `,
    [input.administrationId],
  )
  return result.rows
}

export type UnitLedgerEntryDetailedRow = {
  id: string
  administration_id: string
  managed_property_id: string
  unit_id: string
  accounting_period_id: string | null
  period_year: number | null
  period_month: number | null
  liquidation_run_id: string | null
  liquidation_item_id: string | null
  payment_id: string | null
  entry_type: string
  origin_type: string | null
  origin_id: string | null
  description: string | null
  due_date: string | null
  amount: string
  balance_open: string
  status: string
  metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
  voided_by: string | null
  voided_at: string | null
  void_reason: string | null
}

export async function listUnitLedgerEntriesFromPostgres(input: {
  unitId: string
  managedPropertyId: string
}): Promise<UnitLedgerEntryDetailedRow[]> {
  const result = await pgQuery<UnitLedgerEntryDetailedRow>(
    `
      select
        le.id,
        le.administration_id,
        le.managed_property_id,
        le.unit_id,
        le.accounting_period_id,
        ap.period_year,
        ap.period_month,
        le.liquidation_run_id,
        le.liquidation_item_id,
        le.payment_id,
        le.entry_type::text as entry_type,
        le.origin_type,
        le.origin_id::text as origin_id,
        le.description,
        le.due_date::text as due_date,
        le.amount::text as amount,
        le.balance_open::text as balance_open,
        le.status::text as status,
        le.metadata,
        le.created_by,
        le.created_at::text as created_at,
        le.voided_by,
        le.voided_at::text as voided_at,
        le.void_reason
      from countrify.iadmin_unit_ledger_entries le
      left join countrify.iadmin_accounting_periods ap on ap.id = le.accounting_period_id
      where le.unit_id = $1
        and le.managed_property_id = $2
      order by coalesce(ap.period_year, 0) asc, coalesce(ap.period_month, 0) asc, le.created_at asc
    `,
    [input.unitId, input.managedPropertyId],
  )
  return result.rows
}

export type UnitAppliedPaymentRow = {
  applied_to_entry_id: string
  period_year: number | null
  period_month: number | null
  amount: string
}

export async function listUnitAppliedPaymentsByChargePeriodFromPostgres(input: {
  unitId: string
  windowStart: string
}): Promise<UnitAppliedPaymentRow[]> {
  const result = await pgQuery<UnitAppliedPaymentRow>(
    `
      select
        app.applied_to_entry_id,
        ap.period_year,
        ap.period_month,
        app.amount::text as amount
      from countrify.iadmin_payment_applications app
      inner join countrify.iadmin_unit_ledger_entries le on le.id = app.applied_to_entry_id
      left join countrify.iadmin_accounting_periods ap on ap.id = le.accounting_period_id
      inner join countrify.iadmin_payments p on p.id = app.payment_id
      where app.unit_id = $1
        and app.voided_at is null
        and p.is_void = false
        and p.paid_at >= $2::date
      order by p.paid_at asc, app.created_at asc
    `,
    [input.unitId, input.windowStart],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Profiles del building disponibles para vincular a una unidad
// ----------------------------------------------------------------------------

export async function listLinkableProfilesByBuildingFromPostgres(
  buildingId: string,
): Promise<
  Array<{
    id: string
    email: string
    full_name: string
    role: 'vecino'
    phone: string | null
    active_memberships_count: number
  }>
> {
  const result = await pgQuery<{
    id: string
    email: string
    full_name: string
    role: 'vecino'
    phone: string | null
    active_memberships_count: number
  }>(
    `
      select
        p.id,
        p.email,
        p.full_name,
        p.role,
        p.phone,
        coalesce(m.active_count, 0)::int as active_memberships_count
      from countrify.profiles p
      left join (
        select profile_id, count(*) as active_count
        from countrify.unit_profile_memberships
        where building_id = $1 and active = true
        group by profile_id
      ) m on m.profile_id = p.id
      where p.building_id = $1
        and p.role = 'vecino'
      order by coalesce(m.active_count, 0) asc, p.full_name asc
    `,
    [buildingId],
  )
  return result.rows
}
