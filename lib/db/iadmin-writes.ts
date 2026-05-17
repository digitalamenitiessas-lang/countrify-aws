import { pgQuery } from '@/lib/db/postgres'

// ----------------------------------------------------------------------------
// Lookups compartidos
// ----------------------------------------------------------------------------

export async function getManagedPropertyAdminIdFromPostgres(
  propertyId: string,
): Promise<{ id: string; administration_id: string } | null> {
  const result = await pgQuery<{ id: string; administration_id: string }>(
    `select id, administration_id from countrify.iadmin_managed_properties where id = $1 limit 1`,
    [propertyId],
  )
  return result.rows[0] ?? null
}

export async function getManagedPropertyContextFromPostgres(propertyId: string): Promise<{
  display_name: string | null
  building_name: string
  building_address: string | null
} | null> {
  const result = await pgQuery<{
    display_name: string | null
    building_name: string
    building_address: string | null
  }>(
    `
      select
        mp.display_name,
        b.name as building_name,
        b.address as building_address
      from countrify.iadmin_managed_properties mp
      inner join countrify.buildings b on b.id = mp.building_id
      where mp.id = $1
      limit 1
    `,
    [propertyId],
  )
  return result.rows[0] ?? null
}

export async function getCashAccountFromPostgres(
  accountId: string,
): Promise<{ id: string; managed_property_id: string; name: string } | null> {
  const result = await pgQuery<{ id: string; managed_property_id: string; name: string }>(
    `select id, managed_property_id, name from countrify.iadmin_cash_accounts where id = $1 limit 1`,
    [accountId],
  )
  return result.rows[0] ?? null
}

// ----------------------------------------------------------------------------
// Liquidation items + share tokens
// ----------------------------------------------------------------------------

export async function getLiquidationItemRunFromPostgres(itemId: string): Promise<{
  id: string
  unit_id: string
  liquidation_run_id: string
  administration_id: string
  managed_property_id: string
  run_status: string
} | null> {
  const result = await pgQuery<{
    id: string
    unit_id: string
    liquidation_run_id: string
    administration_id: string
    managed_property_id: string
    run_status: string
  }>(
    `
      select
        i.id,
        i.unit_id,
        i.liquidation_run_id,
        r.administration_id,
        r.managed_property_id,
        r.status::text as run_status
      from countrify.iadmin_liquidation_items i
      inner join countrify.iadmin_liquidation_runs r on r.id = i.liquidation_run_id
      where i.id = $1
      limit 1
    `,
    [itemId],
  )
  return result.rows[0] ?? null
}

export async function revokeLiveShareTokensInPostgres(itemId: string): Promise<void> {
  await pgQuery(
    `update countrify.iadmin_item_share_tokens set revoked_at = now() where liquidation_item_id = $1 and revoked_at is null`,
    [itemId],
  )
}

export async function insertShareTokenInPostgres(input: {
  liquidationItemId: string
  token: string
  expiresAt: string
  createdBy: string
}): Promise<void> {
  await pgQuery(
    `
      insert into countrify.iadmin_item_share_tokens (liquidation_item_id, token, expires_at, created_by)
      values ($1, $2, $3::timestamptz, $4)
    `,
    [input.liquidationItemId, input.token, input.expiresAt, input.createdBy],
  )
}

// ----------------------------------------------------------------------------
// Accounting periods
// ----------------------------------------------------------------------------

export async function ensureAccountingPeriodInPostgres(input: {
  managedPropertyId: string
  periodYear: number
  periodMonth: number
}): Promise<{ id: string }> {
  const existing = await pgQuery<{ id: string }>(
    `select id from countrify.iadmin_accounting_periods where managed_property_id = $1 and period_year = $2 and period_month = $3 limit 1`,
    [input.managedPropertyId, input.periodYear, input.periodMonth],
  )
  if (existing.rows[0]) return existing.rows[0]

  const created = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_accounting_periods (managed_property_id, period_year, period_month, status)
      values ($1, $2, $3, 'open')
      returning id
    `,
    [input.managedPropertyId, input.periodYear, input.periodMonth],
  )
  return created.rows[0]
}

// ----------------------------------------------------------------------------
// Recurring providers + expenses
// ----------------------------------------------------------------------------

export async function listRecurringProvidersFromPostgres(administrationId: string): Promise<
  Array<{
    id: string
    name: string
    recurring_amount: string | null
    recurring_kind: string | null
    default_category: string | null
  }>
> {
  const result = await pgQuery<{
    id: string
    name: string
    recurring_amount: string | null
    recurring_kind: string | null
    default_category: string | null
  }>(
    `
      select id, name, recurring_amount::text as recurring_amount, recurring_kind::text as recurring_kind, default_category
      from countrify.iadmin_providers
      where administration_id = $1 and is_recurring = true and is_active = true
    `,
    [administrationId],
  )
  return result.rows
}

export async function listExpenseProviderIdsForPeriodInPostgres(input: {
  managedPropertyId: string
  periodId: string
  providerIds: string[]
}): Promise<string[]> {
  if (input.providerIds.length === 0) return []
  const result = await pgQuery<{ provider_id: string | null }>(
    `
      select provider_id
      from countrify.iadmin_expenses
      where managed_property_id = $1 and accounting_period_id = $2 and provider_id = any($3::uuid[])
    `,
    [input.managedPropertyId, input.periodId, input.providerIds],
  )
  return result.rows.map((r: { provider_id: string | null }) => r.provider_id).filter((x: string | null): x is string => Boolean(x))
}

export async function listRecentProviderExpensesInPostgres(input: {
  managedPropertyId: string
  providerIds: string[]
  fromDate: string
}): Promise<Array<{ provider_id: string | null; amount: string; issued_at: string | null }>> {
  if (input.providerIds.length === 0) return []
  const result = await pgQuery<{ provider_id: string | null; amount: string; issued_at: string | null }>(
    `
      select provider_id, amount::text as amount, issued_at::text as issued_at
      from countrify.iadmin_expenses
      where managed_property_id = $1
        and provider_id = any($2::uuid[])
        and issued_at >= $3::date
      order by issued_at desc
    `,
    [input.managedPropertyId, input.providerIds, input.fromDate],
  )
  return result.rows
}

export async function insertRecurringExpenseInPostgres(input: {
  administrationId: string
  managedPropertyId: string
  accountingPeriodId: string
  providerId: string
  category: string | null
  description: string
  amount: number
  issuedAt: string
  status: string
  expenseKind: string
  createdBy: string
  approvedBy: string | null
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_expenses (
        administration_id, managed_property_id, accounting_period_id, provider_id,
        category, description, amount, currency, issued_at, status, expense_kind,
        created_by, approved_by, approved_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, 'ARS', $8::date,
        $9::iadmin_expense_status, $10::iadmin_expense_kind,
        $11, $12, case when $12::uuid is null then null else now() end
      )
      returning id
    `,
    [
      input.administrationId,
      input.managedPropertyId,
      input.accountingPeriodId,
      input.providerId,
      input.category,
      input.description,
      input.amount,
      input.issuedAt,
      input.status,
      input.expenseKind,
      input.createdBy,
      input.approvedBy,
    ],
  )
  return result.rows[0]
}

// ----------------------------------------------------------------------------
// Cash accounts
// ----------------------------------------------------------------------------

export async function insertCashAccountInPostgres(input: {
  managedPropertyId: string
  name: string
  kind: string
  bankName: string | null
  accountNumber: string | null
  cbu: string | null
  alias: string | null
  openingBalance: number
  openingBalanceAt: string | null
  notes: string | null
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_cash_accounts (
        managed_property_id, name, kind, bank_name, account_number, cbu, alias,
        opening_balance, opening_balance_at, notes, is_active
      )
      values ($1, $2, $3::iadmin_cash_account_kind, $4, $5, $6, $7, $8, $9::date, $10, true)
      returning id
    `,
    [
      input.managedPropertyId,
      input.name,
      input.kind,
      input.bankName,
      input.accountNumber,
      input.cbu,
      input.alias,
      input.openingBalance,
      input.openingBalanceAt,
      input.notes,
    ],
  )
  return result.rows[0]
}

export async function updateCashAccountInPostgres(
  accountId: string,
  patch: Partial<{
    name: string
    kind: string
    bankName: string | null
    accountNumber: string | null
    cbu: string | null
    alias: string | null
    notes: string | null
    isActive: boolean
  }>,
): Promise<void> {
  const map: Record<string, { col: string; cast?: string }> = {
    name: { col: 'name' },
    kind: { col: 'kind', cast: 'iadmin_cash_account_kind' },
    bankName: { col: 'bank_name' },
    accountNumber: { col: 'account_number' },
    cbu: { col: 'cbu' },
    alias: { col: 'alias' },
    notes: { col: 'notes' },
    isActive: { col: 'is_active' },
  }
  const cols: string[] = []
  const values: unknown[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const meta = map[key]
    if (!meta) continue
    values.push(value)
    cols.push(meta.cast ? `${meta.col} = $${values.length}::${meta.cast}` : `${meta.col} = $${values.length}`)
  }
  if (cols.length === 0) return
  values.push(accountId)
  await pgQuery(
    `update countrify.iadmin_cash_accounts set ${cols.join(', ')} where id = $${values.length}`,
    values,
  )
}

export async function getCashAccountWithAdminFromPostgres(accountId: string): Promise<{
  id: string
  managed_property_id: string
  administration_id: string
} | null> {
  const result = await pgQuery<{
    id: string
    managed_property_id: string
    administration_id: string
  }>(
    `
      select ca.id, ca.managed_property_id, mp.administration_id
      from countrify.iadmin_cash_accounts ca
      inner join countrify.iadmin_managed_properties mp on mp.id = ca.managed_property_id
      where ca.id = $1
      limit 1
    `,
    [accountId],
  )
  return result.rows[0] ?? null
}

// ----------------------------------------------------------------------------
// Expenses (lookups + pagos)
// ----------------------------------------------------------------------------

export async function getExpenseForPaymentFromPostgres(expenseId: string): Promise<{
  id: string
  administration_id: string
  managed_property_id: string
  amount: string
  description: string
  status: string
} | null> {
  const result = await pgQuery<{
    id: string
    administration_id: string
    managed_property_id: string
    amount: string
    description: string
    status: string
  }>(
    `
      select id, administration_id, managed_property_id, amount::text as amount, description, status::text as status
      from countrify.iadmin_expenses
      where id = $1
      limit 1
    `,
    [expenseId],
  )
  return result.rows[0] ?? null
}

export async function existingExpensePaymentMovementInPostgres(expenseId: string): Promise<boolean> {
  const result = await pgQuery<{ id: string }>(
    `select id from countrify.iadmin_bank_movements where expense_id = $1 and movement_kind = 'expense_payment' limit 1`,
    [expenseId],
  )
  return result.rows.length > 0
}

// ----------------------------------------------------------------------------
// Expenses (creación + estado + adjuntos)
// ----------------------------------------------------------------------------

export async function findProviderByNameInPostgres(input: {
  administrationId: string
  name: string
}): Promise<{ id: string } | null> {
  const result = await pgQuery<{ id: string }>(
    `select id from countrify.iadmin_providers where administration_id = $1 and lower(name) = lower($2) limit 1`,
    [input.administrationId, input.name],
  )
  return result.rows[0] ?? null
}

export async function insertProviderQuickFromPostgres(input: {
  administrationId: string
  name: string
  category: string | null
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_providers (administration_id, name, category, default_category, is_active)
      values ($1, $2, $3, $4, true)
      returning id
    `,
    [input.administrationId, input.name, input.category, input.category],
  )
  return result.rows[0]
}

export async function setProviderDefaultCategoryIfNullInPostgres(input: {
  providerId: string
  category: string
}): Promise<void> {
  await pgQuery(
    `update countrify.iadmin_providers set default_category = $1 where id = $2 and default_category is null`,
    [input.category, input.providerId],
  )
}

export async function insertExpenseInPostgres(input: {
  administrationId: string
  managedPropertyId: string
  accountingPeriodId: string | null
  providerId: string | null
  category: string | null
  description: string
  amount: number
  currency: string
  issuedAt: string | null
  dueAt: string | null
  status: string
  expenseKind: string
  createdBy: string
  approvedBy: string | null
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_expenses (
        administration_id, managed_property_id, accounting_period_id, provider_id,
        category, description, amount, currency, issued_at, due_at,
        status, expense_kind, created_by, approved_by, approved_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date,
        $11::iadmin_expense_status, $12::iadmin_expense_kind, $13, $14,
        case when $14::uuid is null then null else now() end
      )
      returning id
    `,
    [
      input.administrationId,
      input.managedPropertyId,
      input.accountingPeriodId,
      input.providerId,
      input.category,
      input.description,
      input.amount,
      input.currency,
      input.issuedAt,
      input.dueAt,
      input.status,
      input.expenseKind,
      input.createdBy,
      input.approvedBy,
    ],
  )
  return result.rows[0]
}

export async function getExpenseStatusInfoFromPostgres(expenseId: string): Promise<{
  id: string
  status: string
  administration_id: string
} | null> {
  const result = await pgQuery<{ id: string; status: string; administration_id: string }>(
    `select id, status::text as status, administration_id from countrify.iadmin_expenses where id = $1 limit 1`,
    [expenseId],
  )
  return result.rows[0] ?? null
}

export async function changeExpenseStatusInPostgres(input: {
  expenseId: string
  nextStatus: string
  approvedBy: string | null
  rejectedReason: string | null
}): Promise<void> {
  if (input.nextStatus === 'approved') {
    await pgQuery(
      `update countrify.iadmin_expenses set status = $1::iadmin_expense_status, approved_by = $2, approved_at = now() where id = $3`,
      [input.nextStatus, input.approvedBy, input.expenseId],
    )
  } else if (input.nextStatus === 'rejected' && input.rejectedReason) {
    await pgQuery(
      `update countrify.iadmin_expenses set status = $1::iadmin_expense_status, rejected_reason = $2 where id = $3`,
      [input.nextStatus, input.rejectedReason, input.expenseId],
    )
  } else {
    await pgQuery(
      `update countrify.iadmin_expenses set status = $1::iadmin_expense_status where id = $2`,
      [input.nextStatus, input.expenseId],
    )
  }
}

export async function insertExpenseDocumentInPostgres(input: {
  expenseId: string
  storagePath: string
  fileName: string
  mimeType: string | null
  sizeBytes: number | null
  uploadedBy: string
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_expense_documents (expense_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
      values ($1, $2, $3, $4, $5, $6)
      returning id
    `,
    [input.expenseId, input.storagePath, input.fileName, input.mimeType, input.sizeBytes, input.uploadedBy],
  )
  return result.rows[0]
}

export async function insertAIExtractionInPostgres(input: {
  documentId: string
  status: string
  provider: string
  suggestedFields: Record<string, unknown>
  confidence: number | null
  validatedBy?: string | null
}): Promise<void> {
  if (input.validatedBy) {
    await pgQuery(
      `
        insert into countrify.iadmin_ai_document_extractions (document_id, status, provider, suggested_fields, confidence, validated_by, validated_at)
        values ($1, $2::iadmin_extraction_status, $3, $4::jsonb, $5, $6, now())
      `,
      [input.documentId, input.status, input.provider, JSON.stringify(input.suggestedFields), input.confidence, input.validatedBy],
    )
  } else {
    await pgQuery(
      `
        insert into countrify.iadmin_ai_document_extractions (document_id, status, provider, suggested_fields, confidence)
        values ($1, $2::iadmin_extraction_status, $3, $4::jsonb, $5)
      `,
      [input.documentId, input.status, input.provider, JSON.stringify(input.suggestedFields), input.confidence],
    )
  }
}

export async function getExpenseDocumentWithAdminFromPostgres(documentId: string): Promise<{
  id: string
  storage_path: string
  file_name: string | null
  expense_id: string
  administration_id: string
} | null> {
  const result = await pgQuery<{
    id: string
    storage_path: string
    file_name: string | null
    expense_id: string
    administration_id: string
  }>(
    `
      select d.id, d.storage_path, d.file_name, d.expense_id, e.administration_id
      from countrify.iadmin_expense_documents d
      inner join countrify.iadmin_expenses e on e.id = d.expense_id
      where d.id = $1
      limit 1
    `,
    [documentId],
  )
  return result.rows[0] ?? null
}

export async function getAIExtractionWithAdminFromPostgres(extractionId: string): Promise<{
  id: string
  document_id: string
  expense_id: string
  administration_id: string
} | null> {
  const result = await pgQuery<{
    id: string
    document_id: string
    expense_id: string
    administration_id: string
  }>(
    `
      select x.id, x.document_id, d.expense_id, e.administration_id
      from countrify.iadmin_ai_document_extractions x
      inner join countrify.iadmin_expense_documents d on d.id = x.document_id
      inner join countrify.iadmin_expenses e on e.id = d.expense_id
      where x.id = $1
      limit 1
    `,
    [extractionId],
  )
  return result.rows[0] ?? null
}

export async function updateAIExtractionDecisionInPostgres(input: {
  extractionId: string
  decision: 'validated' | 'rejected'
  validatedBy: string
  validationNotes: string | null
}): Promise<void> {
  await pgQuery(
    `
      update countrify.iadmin_ai_document_extractions
      set status = $1::iadmin_extraction_status,
          validated_by = $2,
          validated_at = now(),
          validation_notes = $3
      where id = $4
    `,
    [input.decision, input.validatedBy, input.validationNotes, input.extractionId],
  )
}

// ----------------------------------------------------------------------------
// Managed property + units + holders + memberships + building info + periods
// (consorcios/[id]/actions.ts)
// ----------------------------------------------------------------------------

export async function updateManagedPropertyInPostgres(
  propertyId: string,
  patch: Partial<{
    display_name: string | null
    tax_id: string | null
    management_fee_pct: number | null
    managed_since: string | null
    property_kind: string
    notes: string | null
  }>,
): Promise<void> {
  const cols: string[] = []
  const values: unknown[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    values.push(value)
    if (key === 'managed_since') {
      cols.push(`${key} = $${values.length}::date`)
    } else if (key === 'property_kind') {
      cols.push(`${key} = $${values.length}::iadmin_property_kind`)
    } else {
      cols.push(`${key} = $${values.length}`)
    }
  }
  if (cols.length === 0) return
  values.push(propertyId)
  await pgQuery(
    `update countrify.iadmin_managed_properties set ${cols.join(', ')} where id = $${values.length}`,
    values,
  )
}

export async function updatePropertyLegalInfoInPostgres(input: {
  propertyId: string
  legalInfo: Record<string, unknown>
}): Promise<void> {
  await pgQuery(
    `update countrify.iadmin_managed_properties set legal_info = $1::jsonb where id = $2`,
    [JSON.stringify(input.legalInfo), input.propertyId],
  )
}

export async function getBuildingIdForPropertyFromPostgres(propertyId: string): Promise<string | null> {
  const result = await pgQuery<{ building_id: string }>(
    `select building_id from countrify.iadmin_managed_properties where id = $1 limit 1`,
    [propertyId],
  )
  return result.rows[0]?.building_id ?? null
}

export async function insertUnitFromCrudInPostgres(input: {
  managedPropertyId: string
  code: string
  kind: string
  floor: string | null
  surfaceM2: number | null
  prorataCoefficient: number | null
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_units (
        managed_property_id, code, kind, floor, surface_m2, prorata_coefficient, is_active
      )
      values ($1, $2, $3::iadmin_unit_kind, $4, $5, $6, true)
      returning id
    `,
    [
      input.managedPropertyId,
      input.code,
      input.kind,
      input.floor,
      input.surfaceM2,
      input.prorataCoefficient,
    ],
  )
  return result.rows[0]
}

export async function updateUnitInPostgres(
  unitId: string,
  patch: Partial<{
    code: string
    kind: string
    floor: string | null
    surface_m2: number | null
    prorata_coefficient: number | null
  }>,
): Promise<void> {
  const cols: string[] = []
  const values: unknown[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    values.push(value)
    if (key === 'kind') cols.push(`${key} = $${values.length}::iadmin_unit_kind`)
    else cols.push(`${key} = $${values.length}`)
  }
  if (cols.length === 0) return
  values.push(unitId)
  await pgQuery(
    `update countrify.iadmin_units set ${cols.join(', ')} where id = $${values.length}`,
    values,
  )
}

export async function getUnitWithAdminFromPostgres(unitId: string): Promise<{
  id: string
  managed_property_id: string
  administration_id: string
  building_id: string
  code: string
} | null> {
  const result = await pgQuery<{
    id: string
    managed_property_id: string
    administration_id: string
    building_id: string
    code: string
  }>(
    `
      select u.id, u.managed_property_id, mp.administration_id, mp.building_id, u.code
      from countrify.iadmin_units u
      inner join countrify.iadmin_managed_properties mp on mp.id = u.managed_property_id
      where u.id = $1
      limit 1
    `,
    [unitId],
  )
  return result.rows[0] ?? null
}

export async function deactivateUnitInPostgres(unitId: string): Promise<void> {
  await pgQuery(`update countrify.iadmin_units set is_active = false where id = $1`, [unitId])
}

export async function insertUnitHolderFromCrudInPostgres(input: {
  unitId: string
  fullName: string
  holderKind: string
  taxId: string | null
  email: string | null
  phone: string | null
  startDate: string | null
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_unit_holders (
        unit_id, full_name, holder_kind, tax_id, email, phone, start_date, is_active
      )
      values ($1, $2, $3::iadmin_holder_kind, $4, $5, $6, $7::date, true)
      returning id
    `,
    [
      input.unitId,
      input.fullName,
      input.holderKind,
      input.taxId,
      input.email,
      input.phone,
      input.startDate,
    ],
  )
  return result.rows[0]
}

export async function getHolderWithAdminFromPostgres(holderId: string): Promise<{
  id: string
  unit_id: string
  managed_property_id: string
  administration_id: string
} | null> {
  const result = await pgQuery<{
    id: string
    unit_id: string
    managed_property_id: string
    administration_id: string
  }>(
    `
      select h.id, h.unit_id, u.managed_property_id, mp.administration_id
      from countrify.iadmin_unit_holders h
      inner join countrify.iadmin_units u on u.id = h.unit_id
      inner join countrify.iadmin_managed_properties mp on mp.id = u.managed_property_id
      where h.id = $1
      limit 1
    `,
    [holderId],
  )
  return result.rows[0] ?? null
}

export async function endHolderInPostgres(input: {
  holderId: string
  endDate: string
}): Promise<void> {
  await pgQuery(
    `update countrify.iadmin_unit_holders set is_active = false, end_date = $1::date where id = $2`,
    [input.endDate, input.holderId],
  )
}

export async function getUnitFullScopeFromPostgres(unitId: string): Promise<{
  unitId: string
  unitCode: string
  managedPropertyId: string
  administrationId: string
  buildingId: string
} | null> {
  const row = await getUnitWithAdminFromPostgres(unitId)
  if (!row) return null
  return {
    unitId: row.id,
    unitCode: row.code,
    managedPropertyId: row.managed_property_id,
    administrationId: row.administration_id,
    buildingId: row.building_id,
  }
}

export async function findPrincipalMembershipForProfileFromPostgres(input: {
  unitId: string
  profileId: string
}): Promise<{ id: string; building_id: string } | null> {
  const result = await pgQuery<{ id: string; building_id: string }>(
    `select id, building_id from countrify.unit_profile_memberships where unit_id = $1 and profile_id = $2 and relationship_type = 'vecino_principal' and active = true limit 1`,
    [input.unitId, input.profileId],
  )
  return result.rows[0] ?? null
}

export async function countActiveAdditionalNeighborsInPostgres(unitId: string): Promise<number> {
  const result = await pgQuery<{ c: number }>(
    `select count(*)::int as c from countrify.unit_profile_memberships where unit_id = $1 and relationship_type = 'vecino_adicional' and active = true`,
    [unitId],
  )
  return result.rows[0]?.c ?? 0
}

export async function deactivateActivePrincipalMembershipsInPostgres(unitId: string): Promise<void> {
  await pgQuery(
    `update countrify.unit_profile_memberships set active = false where unit_id = $1 and relationship_type = 'vecino_principal' and active = true`,
    [unitId],
  )
}

export async function findUnitProfileMembershipFromPostgres(input: {
  unitId: string
  profileId: string
  relationshipType: string
}): Promise<{ id: string } | null> {
  const result = await pgQuery<{ id: string }>(
    `select id from countrify.unit_profile_memberships where unit_id = $1 and profile_id = $2 and relationship_type = $3 limit 1`,
    [input.unitId, input.profileId, input.relationshipType],
  )
  return result.rows[0] ?? null
}

export async function upsertUnitProfileMembershipInPostgres(input: {
  membershipId: string | null
  unitId: string
  buildingId: string
  profileId: string
  relationshipType: string
  isPrimary: boolean
  createdByProfileId: string | null
}): Promise<void> {
  if (input.membershipId) {
    await pgQuery(
      `
        update countrify.unit_profile_memberships
        set unit_id = $1,
            building_id = $2,
            profile_id = $3,
            relationship_type = $4,
            is_primary = $5,
            active = true,
            created_by_profile_id = coalesce($6, created_by_profile_id)
        where id = $7
      `,
      [
        input.unitId,
        input.buildingId,
        input.profileId,
        input.relationshipType,
        input.isPrimary,
        input.createdByProfileId,
        input.membershipId,
      ],
    )
    return
  }
  await pgQuery(
    `
      insert into countrify.unit_profile_memberships (
        unit_id, building_id, profile_id, relationship_type, is_primary, active, created_by_profile_id
      )
      values ($1, $2, $3, $4, $5, true, $6)
    `,
    [
      input.unitId,
      input.buildingId,
      input.profileId,
      input.relationshipType,
      input.isPrimary,
      input.createdByProfileId,
    ],
  )
}

export async function findOwnerHolderForProfileFromPostgres(input: {
  unitId: string
  profileId: string
}): Promise<{ id: string } | null> {
  const result = await pgQuery<{ id: string }>(
    `select id from countrify.iadmin_unit_holders where unit_id = $1 and profile_id = $2 and holder_kind = 'propietario' limit 1`,
    [input.unitId, input.profileId],
  )
  return result.rows[0] ?? null
}

export async function insertOwnerHolderInPostgres(input: {
  unitId: string
  profileId: string
  fullName: string
  email: string | null
  phone: string | null
}): Promise<void> {
  await pgQuery(
    `
      insert into countrify.iadmin_unit_holders (
        unit_id, profile_id, full_name, holder_kind, email, phone, is_active
      )
      values ($1, $2, $3, 'propietario'::iadmin_holder_kind, $4, $5, true)
    `,
    [input.unitId, input.profileId, input.fullName, input.email, input.phone],
  )
}

export async function getMembershipWithAdminFromPostgres(membershipId: string): Promise<{
  id: string
  unit_id: string
  managed_property_id: string
  administration_id: string
} | null> {
  const result = await pgQuery<{
    id: string
    unit_id: string
    managed_property_id: string
    administration_id: string
  }>(
    `
      select m.id, m.unit_id, u.managed_property_id, mp.administration_id
      from countrify.unit_profile_memberships m
      inner join countrify.iadmin_units u on u.id = m.unit_id
      inner join countrify.iadmin_managed_properties mp on mp.id = u.managed_property_id
      where m.id = $1
      limit 1
    `,
    [membershipId],
  )
  return result.rows[0] ?? null
}

export async function deactivateMembershipByIdInPostgres(membershipId: string): Promise<void> {
  await pgQuery(
    `update countrify.unit_profile_memberships set active = false where id = $1`,
    [membershipId],
  )
}

export async function insertBuildingInformationInPostgres(input: {
  buildingId: string
  title: string
  category: string
  content: string
  visibleTo: string
  sortOrder: number
  createdByProfileId: string
}): Promise<void> {
  await pgQuery(
    `
      insert into countrify.building_information (
        building_id, title, category, content, visible_to, sort_order,
        created_by_profile_id, updated_by_profile_id, is_active
      )
      values ($1, $2, $3, $4, $5, $6, $7, $7, true)
    `,
    [
      input.buildingId,
      input.title,
      input.category,
      input.content,
      input.visibleTo,
      input.sortOrder,
      input.createdByProfileId,
    ],
  )
}

export async function deactivateBuildingInformationInPostgres(input: {
  itemId: string
  updatedByProfileId: string
}): Promise<void> {
  await pgQuery(
    `update countrify.building_information set is_active = false, updated_by_profile_id = $1 where id = $2`,
    [input.updatedByProfileId, input.itemId],
  )
}

export async function upsertAccountingPeriodOpenInPostgres(input: {
  managedPropertyId: string
  periodYear: number
  periodMonth: number
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_accounting_periods (managed_property_id, period_year, period_month, status)
      values ($1, $2, $3, 'open')
      on conflict (managed_property_id, period_year, period_month) do update set status = 'open'
      returning id
    `,
    [input.managedPropertyId, input.periodYear, input.periodMonth],
  )
  return result.rows[0]
}

export async function getAccountingPeriodWithAdminFromPostgres(periodId: string): Promise<{
  id: string
  managed_property_id: string
  administration_id: string
} | null> {
  const result = await pgQuery<{
    id: string
    managed_property_id: string
    administration_id: string
  }>(
    `
      select ap.id, ap.managed_property_id, mp.administration_id
      from countrify.iadmin_accounting_periods ap
      inner join countrify.iadmin_managed_properties mp on mp.id = ap.managed_property_id
      where ap.id = $1
      limit 1
    `,
    [periodId],
  )
  return result.rows[0] ?? null
}

export async function changeAccountingPeriodStatusInPostgres(input: {
  periodId: string
  nextStatus: 'open' | 'locked' | 'closed'
  closedByProfileId: string | null
}): Promise<void> {
  if (input.nextStatus === 'closed') {
    await pgQuery(
      `update countrify.iadmin_accounting_periods set status = 'closed', closed_at = now(), closed_by = $1 where id = $2`,
      [input.closedByProfileId, input.periodId],
    )
  } else {
    await pgQuery(
      `update countrify.iadmin_accounting_periods set status = $1, closed_at = null, closed_by = null where id = $2`,
      [input.nextStatus, input.periodId],
    )
  }
}

// ----------------------------------------------------------------------------
// Planilla import (suggest match + duplicates check)
// ----------------------------------------------------------------------------

export async function getProviderExactByNameForAdminFromPostgres(input: {
  administrationId: string
  name: string
}): Promise<{
  id: string
  name: string
  category: string | null
  default_category: string | null
  is_recurring: boolean
  recurring_kind: string | null
} | null> {
  const result = await pgQuery<{
    id: string
    name: string
    category: string | null
    default_category: string | null
    is_recurring: boolean
    recurring_kind: string | null
  }>(
    `select id, name, category, default_category, is_recurring, recurring_kind::text as recurring_kind from countrify.iadmin_providers where administration_id = $1 and lower(name) = lower($2) limit 1`,
    [input.administrationId, input.name],
  )
  return result.rows[0] ?? null
}

export async function listProvidersFuzzyByTokensFromPostgres(input: {
  administrationId: string
  tokens: string[]
  limit: number
}): Promise<
  Array<{
    id: string
    name: string
    category: string | null
    default_category: string | null
    is_recurring: boolean
    recurring_kind: string | null
  }>
> {
  if (input.tokens.length === 0) return []
  const placeholders = input.tokens.map((_, i) => `name ilike $${i + 2}`).join(' or ')
  const params: unknown[] = [input.administrationId, ...input.tokens.map((t) => `%${t}%`)]
  const result = await pgQuery<{
    id: string
    name: string
    category: string | null
    default_category: string | null
    is_recurring: boolean
    recurring_kind: string | null
  }>(
    `select id, name, category, default_category, is_recurring, recurring_kind::text as recurring_kind from countrify.iadmin_providers where administration_id = $1 and is_active = true and (${placeholders}) limit ${Math.max(1, Math.min(50, input.limit))}`,
    params,
  )
  return result.rows
}

export async function getProviderForAdminFromPostgres(input: {
  providerId: string
  administrationId: string
}): Promise<{ name: string } | null> {
  const result = await pgQuery<{ name: string }>(
    `select name from countrify.iadmin_providers where id = $1 and administration_id = $2 limit 1`,
    [input.providerId, input.administrationId],
  )
  return result.rows[0] ?? null
}

export async function listExpensesForDuplicateCheckFromPostgres(input: {
  managedPropertyId: string
  providerId: string
  accountingPeriodId: string
}): Promise<
  Array<{
    id: string
    amount: string
    description: string | null
    issued_at: string | null
    status: string
    created_at: string | null
    created_by: string | null
    has_document: boolean
  }>
> {
  const result = await pgQuery<{
    id: string
    amount: string
    description: string | null
    issued_at: string | null
    status: string
    created_at: string | null
    created_by: string | null
    has_document: boolean
  }>(
    `
      select
        e.id,
        e.amount::text as amount,
        e.description,
        e.issued_at::text as issued_at,
        e.status::text as status,
        e.created_at::text as created_at,
        e.created_by,
        exists(select 1 from countrify.iadmin_expense_documents d where d.expense_id = e.id) as has_document
      from countrify.iadmin_expenses e
      where e.managed_property_id = $1
        and e.provider_id = $2
        and e.accounting_period_id = $3
        and e.status <> 'rejected'
      order by e.created_at desc
    `,
    [input.managedPropertyId, input.providerId, input.accountingPeriodId],
  )
  return result.rows
}

export async function listProfileNamesByIdsFromPostgres(profileIds: string[]): Promise<
  Map<string, string>
> {
  const out = new Map<string, string>()
  if (profileIds.length === 0) return out
  const result = await pgQuery<{ id: string; full_name: string | null; email: string | null }>(
    `select id, full_name, email from countrify.profiles where id = any($1::uuid[])`,
    [profileIds],
  )
  for (const r of result.rows) {
    out.set(r.id, r.full_name || r.email || 'Usuario')
  }
  return out
}

// ----------------------------------------------------------------------------
// Planilla mensual
// ----------------------------------------------------------------------------

export async function getAccountingPeriodIdAndStatusFromPostgres(input: {
  managedPropertyId: string
  periodYear: number
  periodMonth: number
}): Promise<{ id: string; status: string } | null> {
  const result = await pgQuery<{ id: string; status: string }>(
    `select id, status::text as status from countrify.iadmin_accounting_periods where managed_property_id = $1 and period_year = $2 and period_month = $3 limit 1`,
    [input.managedPropertyId, input.periodYear, input.periodMonth],
  )
  return result.rows[0] ?? null
}

export async function findExpenseInPeriodByProviderFromPostgres(input: {
  managedPropertyId: string
  accountingPeriodId: string
  providerId: string | null
}): Promise<{ id: string; status: string } | null> {
  if (input.providerId === null) {
    const result = await pgQuery<{ id: string; status: string }>(
      `select id, status::text as status from countrify.iadmin_expenses where managed_property_id = $1 and accounting_period_id = $2 and provider_id is null`,
      [input.managedPropertyId, input.accountingPeriodId],
    )
    if (result.rows.length !== 1) return null
    return result.rows[0]
  }
  const result = await pgQuery<{ id: string; status: string }>(
    `select id, status::text as status from countrify.iadmin_expenses where managed_property_id = $1 and accounting_period_id = $2 and provider_id = $3`,
    [input.managedPropertyId, input.accountingPeriodId, input.providerId],
  )
  if (result.rows.length !== 1) return null
  return result.rows[0]
}

export async function deleteExpenseFromPostgres(expenseId: string): Promise<void> {
  await pgQuery(`delete from countrify.iadmin_expenses where id = $1`, [expenseId])
}

export async function updateExpenseAmountInPostgres(input: {
  expenseId: string
  amount: number
  description: string
  expenseKind: string
  status: string
  approvedBy: string | null
  setApprovedTimestamp: boolean
}): Promise<void> {
  if (input.setApprovedTimestamp && input.approvedBy) {
    await pgQuery(
      `
        update countrify.iadmin_expenses
        set amount = $1,
            description = $2,
            expense_kind = $3::iadmin_expense_kind,
            status = $4::iadmin_expense_status,
            approved_by = $5,
            approved_at = now()
        where id = $6
      `,
      [input.amount, input.description, input.expenseKind, input.status, input.approvedBy, input.expenseId],
    )
  } else {
    await pgQuery(
      `
        update countrify.iadmin_expenses
        set amount = $1,
            description = $2,
            expense_kind = $3::iadmin_expense_kind,
            status = $4::iadmin_expense_status
        where id = $5
      `,
      [input.amount, input.description, input.expenseKind, input.status, input.expenseId],
    )
  }
}

export async function getProviderNameAndDefaultDescFromPostgres(providerId: string): Promise<{
  name: string
  default_description: string | null
} | null> {
  const result = await pgQuery<{ name: string; default_description: string | null }>(
    `select name, default_description from countrify.iadmin_providers where id = $1 limit 1`,
    [providerId],
  )
  return result.rows[0] ?? null
}

export async function findProviderByNameWithRecurringFromPostgres(input: {
  administrationId: string
  name: string
}): Promise<{ id: string; is_recurring: boolean } | null> {
  const result = await pgQuery<{ id: string; is_recurring: boolean }>(
    `select id, is_recurring from countrify.iadmin_providers where administration_id = $1 and lower(name) = lower($2) limit 1`,
    [input.administrationId, input.name],
  )
  return result.rows[0] ?? null
}

export async function setProviderRecurringInPostgres(input: {
  providerId: string
  isRecurring: boolean
  recurringKind: string
}): Promise<void> {
  await pgQuery(
    `update countrify.iadmin_providers set is_recurring = $1, recurring_kind = $2::iadmin_expense_kind where id = $3`,
    [input.isRecurring, input.recurringKind, input.providerId],
  )
}

export async function insertProviderRecurringFromPostgres(input: {
  administrationId: string
  name: string
  category: string | null
  recurringKind: string
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_providers (
        administration_id, name, category, default_category, is_recurring, recurring_kind, is_active
      )
      values ($1, $2, $3, $4, true, $5::iadmin_expense_kind, true)
      returning id
    `,
    [input.administrationId, input.name, input.category, input.category, input.recurringKind],
  )
  return result.rows[0]
}

export async function getManagedPropertyForEmitFromPostgres(propertyId: string): Promise<{
  id: string
  administration_id: string
  display_name: string | null
  building_name: string
  admin_name: string | null
  admin_legal_info: any
} | null> {
  const result = await pgQuery<{
    id: string
    administration_id: string
    display_name: string | null
    building_name: string
    admin_name: string | null
    admin_legal_info: any
  }>(
    `
      select
        mp.id,
        mp.administration_id,
        mp.display_name,
        b.name as building_name,
        a.name as admin_name,
        a.legal_info as admin_legal_info
      from countrify.iadmin_managed_properties mp
      inner join countrify.buildings b on b.id = mp.building_id
      inner join countrify.iadmin_administrations a on a.id = mp.administration_id
      where mp.id = $1
      limit 1
    `,
    [propertyId],
  )
  return result.rows[0] ?? null
}

export async function listImputedExpensesAmountsByPeriodFromPostgres(input: {
  managedPropertyId: string
  accountingPeriodId: string
}): Promise<Array<{ amount: string; expense_kind: string | null }>> {
  const result = await pgQuery<{ amount: string; expense_kind: string | null }>(
    `select amount::text as amount, expense_kind::text as expense_kind from countrify.iadmin_expenses where managed_property_id = $1 and accounting_period_id = $2 and status = 'imputed'`,
    [input.managedPropertyId, input.accountingPeriodId],
  )
  return result.rows
}

export async function listActiveUnitsWithHoldersForEmitFromPostgres(propertyId: string): Promise<
  Array<{
    id: string
    code: string
    prorata_coefficient: string | null
    holder_name: string | null
    holder_phone: string | null
    holder_email: string | null
  }>
> {
  const result = await pgQuery<{
    id: string
    code: string
    prorata_coefficient: string | null
    holder_name: string | null
    holder_phone: string | null
    holder_email: string | null
  }>(
    `
      with chosen_holder as (
        select distinct on (unit_id)
          unit_id, full_name, phone, email, is_active
        from countrify.iadmin_unit_holders
        order by unit_id, is_active desc, created_at asc
      )
      select
        u.id,
        u.code,
        u.prorata_coefficient::text as prorata_coefficient,
        ch.full_name as holder_name,
        ch.phone as holder_phone,
        ch.email as holder_email
      from countrify.iadmin_units u
      left join chosen_holder ch on ch.unit_id = u.id
      where u.managed_property_id = $1 and u.is_active = true
      order by u.code
    `,
    [propertyId],
  )
  return result.rows
}

export async function listPriorRunItemsForEmitFromPostgres(input: {
  managedPropertyId: string
  excludePeriodId: string
}): Promise<Array<{
  item_id: string
  unit_id: string
  ordinary_amount: string | null
  extraordinary_amount: string | null
  previous_balance: string | null
}>> {
  const result = await pgQuery<{
    item_id: string
    unit_id: string
    ordinary_amount: string | null
    extraordinary_amount: string | null
    previous_balance: string | null
  }>(
    `
      with prior_run as (
        select id from countrify.iadmin_liquidation_runs
        where managed_property_id = $1
          and accounting_period_id <> $2
          and status in ('calculated', 'issued', 'closed')
        order by generated_at desc
        limit 1
      )
      select i.id as item_id, i.unit_id,
             i.ordinary_amount::text as ordinary_amount,
             i.extraordinary_amount::text as extraordinary_amount,
             i.previous_balance::text as previous_balance
      from countrify.iadmin_liquidation_items i
      where i.liquidation_run_id in (select id from prior_run)
    `,
    [input.managedPropertyId, input.excludePeriodId],
  )
  return result.rows
}

export async function upsertIssuedLiquidationRunInPostgres(input: {
  administrationId: string
  managedPropertyId: string
  accountingPeriodId: string
  totalExpenses: number
  ordinaryTotal: number
  extraordinaryTotal: number
  previousBalance: number
  dueDates: unknown
  totalUnits: number
  generatedBy: string
  issuedBy: string
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_liquidation_runs (
        administration_id, managed_property_id, accounting_period_id, status,
        total_expenses, ordinary_total, extraordinary_total, previous_balance,
        due_dates, total_units, generated_by, generated_at,
        issued_by, issued_at, closed_by, closed_at
      )
      values (
        $1, $2, $3, 'issued'::iadmin_liquidation_status,
        $4, $5, $6, $7, $8::jsonb, $9, $10, now(),
        $11, now(), null, null
      )
      on conflict (managed_property_id, accounting_period_id) do update set
        status = 'issued'::iadmin_liquidation_status,
        total_expenses = excluded.total_expenses,
        ordinary_total = excluded.ordinary_total,
        extraordinary_total = excluded.extraordinary_total,
        previous_balance = excluded.previous_balance,
        due_dates = excluded.due_dates,
        total_units = excluded.total_units,
        generated_by = excluded.generated_by,
        generated_at = now(),
        issued_by = excluded.issued_by,
        issued_at = now(),
        closed_by = null,
        closed_at = null
      returning id
    `,
    [
      input.administrationId,
      input.managedPropertyId,
      input.accountingPeriodId,
      input.totalExpenses,
      input.ordinaryTotal,
      input.extraordinaryTotal,
      input.previousBalance,
      JSON.stringify(input.dueDates),
      input.totalUnits,
      input.generatedBy,
      input.issuedBy,
    ],
  )
  return result.rows[0]
}

export async function listLiquidationItemsByRunFromPostgres(runId: string): Promise<
  Array<{
    id: string
    unit_id: string
    ordinary_amount: string | null
    extraordinary_amount: string | null
    previous_balance: string | null
  }>
> {
  const result = await pgQuery<{
    id: string
    unit_id: string
    ordinary_amount: string | null
    extraordinary_amount: string | null
    previous_balance: string | null
  }>(
    `select id, unit_id, ordinary_amount::text as ordinary_amount, extraordinary_amount::text as extraordinary_amount, previous_balance::text as previous_balance from countrify.iadmin_liquidation_items where liquidation_run_id = $1`,
    [runId],
  )
  return result.rows
}

export async function bulkRevokeShareTokensInPostgres(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return
  await pgQuery(
    `update countrify.iadmin_item_share_tokens set revoked_at = now() where liquidation_item_id = any($1::uuid[]) and revoked_at is null`,
    [itemIds],
  )
}

export async function bulkInsertShareTokensInPostgres(
  rows: Array<{ liquidationItemId: string; token: string; expiresAt: string; createdBy: string }>,
): Promise<void> {
  if (rows.length === 0) return
  const values: unknown[] = []
  const placeholders: string[] = []
  for (const r of rows) {
    const idx = values.length
    values.push(r.liquidationItemId, r.token, r.expiresAt, r.createdBy)
    placeholders.push(`($${idx + 1}, $${idx + 2}, $${idx + 3}::timestamptz, $${idx + 4})`)
  }
  await pgQuery(
    `insert into countrify.iadmin_item_share_tokens (liquidation_item_id, token, expires_at, created_by) values ${placeholders.join(', ')}`,
    values,
  )
}

export async function listLiveShareTokensByItemsFromPostgres(itemIds: string[]): Promise<
  Array<{ token: string; liquidation_item_id: string }>
> {
  if (itemIds.length === 0) return []
  const result = await pgQuery<{ token: string; liquidation_item_id: string }>(
    `select token, liquidation_item_id from countrify.iadmin_item_share_tokens where liquidation_item_id = any($1::uuid[]) and revoked_at is null`,
    [itemIds],
  )
  return result.rows
}

export async function getFirstActiveCashAccountFromPostgres(propertyId: string): Promise<{
  id: string
  name: string
} | null> {
  const result = await pgQuery<{ id: string; name: string }>(
    `select id, name from countrify.iadmin_cash_accounts where managed_property_id = $1 and is_active = true order by created_at limit 1`,
    [propertyId],
  )
  return result.rows[0] ?? null
}

export async function getLiquidationRunByPeriodFromPostgres(input: {
  managedPropertyId: string
  accountingPeriodId: string
}): Promise<{ id: string } | null> {
  const result = await pgQuery<{ id: string }>(
    `select id from countrify.iadmin_liquidation_runs where managed_property_id = $1 and accounting_period_id = $2 limit 1`,
    [input.managedPropertyId, input.accountingPeriodId],
  )
  return result.rows[0] ?? null
}

export async function getLiquidationItemByRunUnitFromPostgres(input: {
  runId: string
  unitId: string
}): Promise<{ id: string } | null> {
  const result = await pgQuery<{ id: string }>(
    `select id from countrify.iadmin_liquidation_items where liquidation_run_id = $1 and unit_id = $2 limit 1`,
    [input.runId, input.unitId],
  )
  return result.rows[0] ?? null
}

// ----------------------------------------------------------------------------
// Predicciones de planilla (proveedores + historial de expenses)
// ----------------------------------------------------------------------------

export async function listActiveProvidersForPredictionFromPostgres(
  administrationId: string,
): Promise<
  Array<{
    id: string
    name: string
    default_category: string | null
    recurring_kind: string | null
    is_recurring: boolean
  }>
> {
  const result = await pgQuery<{
    id: string
    name: string
    default_category: string | null
    recurring_kind: string | null
    is_recurring: boolean
  }>(
    `
      select id, name, default_category, recurring_kind::text as recurring_kind, is_recurring
      from countrify.iadmin_providers
      where administration_id = $1 and is_active = true
    `,
    [administrationId],
  )
  return result.rows
}

export async function listExpensesWithPeriodForPredictionFromPostgres(input: {
  managedPropertyId: string
  fromDate: string
}): Promise<
  Array<{
    provider_id: string | null
    amount: string
    period_year: number | null
    period_month: number | null
  }>
> {
  const result = await pgQuery<{
    provider_id: string | null
    amount: string
    period_year: number | null
    period_month: number | null
  }>(
    `
      select e.provider_id, e.amount::text as amount, ap.period_year, ap.period_month
      from countrify.iadmin_expenses e
      left join countrify.iadmin_accounting_periods ap on ap.id = e.accounting_period_id
      where e.managed_property_id = $1
        and e.issued_at >= $2::date
        and e.status <> 'rejected'
    `,
    [input.managedPropertyId, input.fromDate],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Conciliacion (bank statement)
// ----------------------------------------------------------------------------

export async function listOpenLiquidationItemsForPropertyFromPostgres(
  propertyId: string,
): Promise<
  Array<{
    item_id: string
    unit_id: string
    liquidation_run_id: string
    run_status: string
    ordinary_amount: string | null
    extraordinary_amount: string | null
    previous_balance: string | null
    unit_code: string | null
    holder_name: string | null
  }>
> {
  const result = await pgQuery<{
    item_id: string
    unit_id: string
    liquidation_run_id: string
    run_status: string
    ordinary_amount: string | null
    extraordinary_amount: string | null
    previous_balance: string | null
    unit_code: string | null
    holder_name: string | null
  }>(
    `
      with chosen_holder as (
        select distinct on (unit_id)
          unit_id, full_name, is_active
        from countrify.iadmin_unit_holders
        order by unit_id, is_active desc, created_at asc
      )
      select
        i.id as item_id,
        i.unit_id,
        i.liquidation_run_id,
        r.status::text as run_status,
        i.ordinary_amount::text as ordinary_amount,
        i.extraordinary_amount::text as extraordinary_amount,
        i.previous_balance::text as previous_balance,
        u.code as unit_code,
        ch.full_name as holder_name
      from countrify.iadmin_liquidation_items i
      inner join countrify.iadmin_liquidation_runs r on r.id = i.liquidation_run_id
      left join countrify.iadmin_units u on u.id = i.unit_id
      left join chosen_holder ch on ch.unit_id = u.id
      where r.managed_property_id = $1
        and r.status in ('calculated', 'issued', 'closed')
    `,
    [propertyId],
  )
  return result.rows
}

export async function listUnpaidApprovedExpensesFromPostgres(
  propertyId: string,
): Promise<
  Array<{
    id: string
    description: string
    amount: string
    provider_name: string | null
  }>
> {
  const result = await pgQuery<{
    id: string
    description: string
    amount: string
    provider_name: string | null
  }>(
    `
      select
        e.id,
        e.description,
        e.amount::text as amount,
        p.name as provider_name
      from countrify.iadmin_expenses e
      left join countrify.iadmin_providers p on p.id = e.provider_id
      where e.managed_property_id = $1
        and e.status in ('approved', 'imputed')
        and not exists (
          select 1
          from countrify.iadmin_bank_movements m
          where m.expense_id = e.id and m.movement_kind = 'expense_payment'
        )
    `,
    [propertyId],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Units + holders (bulk import desde XLSX)
// ----------------------------------------------------------------------------

export async function listUnitsByPropertyMinimalFromPostgres(
  propertyId: string,
): Promise<Array<{ id: string; code: string }>> {
  const result = await pgQuery<{ id: string; code: string }>(
    `select id, code from countrify.iadmin_units where managed_property_id = $1`,
    [propertyId],
  )
  return result.rows
}

export async function upsertUnitInPostgres(input: {
  id?: string | null
  managedPropertyId: string
  code: string
  kind: string
  floor: string | null
  surfaceM2: number | null
  prorataCoefficient: number | null
}): Promise<{ id: string }> {
  if (input.id) {
    await pgQuery(
      `
        update countrify.iadmin_units
        set kind = $1::iadmin_unit_kind,
            floor = $2,
            surface_m2 = $3,
            prorata_coefficient = $4,
            is_active = true
        where id = $5
      `,
      [input.kind, input.floor, input.surfaceM2, input.prorataCoefficient, input.id],
    )
    return { id: input.id }
  }
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_units (
        managed_property_id, code, kind, floor, surface_m2, prorata_coefficient, is_active
      )
      values ($1, $2, $3::iadmin_unit_kind, $4, $5, $6, true)
      returning id
    `,
    [
      input.managedPropertyId,
      input.code,
      input.kind,
      input.floor,
      input.surfaceM2,
      input.prorataCoefficient,
    ],
  )
  return result.rows[0]
}

export async function closeActiveHoldersOfKindInPostgres(input: {
  unitId: string
  holderKind: string
}): Promise<void> {
  await pgQuery(
    `
      update countrify.iadmin_unit_holders
      set is_active = false, end_date = current_date
      where unit_id = $1 and holder_kind = $2::iadmin_holder_kind and is_active = true
    `,
    [input.unitId, input.holderKind],
  )
}

export async function insertUnitHolderInPostgres(input: {
  unitId: string
  fullName: string
  holderKind: string
  taxId: string | null
  email: string | null
  phone: string | null
  startDate?: string | null
  profileId?: string | null
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_unit_holders (
        unit_id, profile_id, full_name, holder_kind, tax_id, email, phone, start_date, is_active
      )
      values ($1, $2, $3, $4::iadmin_holder_kind, $5, $6, $7, $8::date, true)
      returning id
    `,
    [
      input.unitId,
      input.profileId ?? null,
      input.fullName,
      input.holderKind,
      input.taxId,
      input.email,
      input.phone,
      input.startDate ?? null,
    ],
  )
  return result.rows[0]
}

// ----------------------------------------------------------------------------
// Liquidations
// ----------------------------------------------------------------------------

export async function getLiquidationRunWithAdminFromPostgres(runId: string): Promise<{
  id: string
  status: string
  administration_id: string
  managed_property_id: string
  accounting_period_id: string
} | null> {
  const result = await pgQuery<{
    id: string
    status: string
    administration_id: string
    managed_property_id: string
    accounting_period_id: string
  }>(
    `select id, status::text as status, administration_id, managed_property_id, accounting_period_id from countrify.iadmin_liquidation_runs where id = $1 limit 1`,
    [runId],
  )
  return result.rows[0] ?? null
}

export async function getAccountingPeriodFromPostgres(periodId: string): Promise<{
  id: string
  managed_property_id: string
  status: string
  period_year: number
  period_month: number
} | null> {
  const result = await pgQuery<{
    id: string
    managed_property_id: string
    status: string
    period_year: number
    period_month: number
  }>(
    `select id, managed_property_id, status::text as status, period_year, period_month from countrify.iadmin_accounting_periods where id = $1 limit 1`,
    [periodId],
  )
  return result.rows[0] ?? null
}

export async function getExistingLiquidationRunForPeriodFromPostgres(input: {
  managedPropertyId: string
  accountingPeriodId: string
}): Promise<{ id: string; status: string } | null> {
  const result = await pgQuery<{ id: string; status: string }>(
    `select id, status::text as status from countrify.iadmin_liquidation_runs where managed_property_id = $1 and accounting_period_id = $2 limit 1`,
    [input.managedPropertyId, input.accountingPeriodId],
  )
  return result.rows[0] ?? null
}

export async function listImputedExpensesByPeriodFromPostgres(input: {
  managedPropertyId: string
  accountingPeriodId: string
}): Promise<Array<{ id: string; amount: string; expense_kind: string | null }>> {
  const result = await pgQuery<{ id: string; amount: string; expense_kind: string | null }>(
    `
      select id, amount::text as amount, expense_kind::text as expense_kind
      from countrify.iadmin_expenses
      where managed_property_id = $1
        and accounting_period_id = $2
        and status = 'imputed'
    `,
    [input.managedPropertyId, input.accountingPeriodId],
  )
  return result.rows
}

export async function listActiveUnitsWithProrataFromPostgres(propertyId: string): Promise<
  Array<{ id: string; code: string; prorata_coefficient: string | null }>
> {
  const result = await pgQuery<{ id: string; code: string; prorata_coefficient: string | null }>(
    `
      select id, code, prorata_coefficient::text as prorata_coefficient
      from countrify.iadmin_units
      where managed_property_id = $1 and is_active = true
      order by code
    `,
    [propertyId],
  )
  return result.rows
}

export async function sumLivePaymentsByItemIdsFromPostgres(
  itemIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (itemIds.length === 0) return out
  const result = await pgQuery<{ liquidation_item_id: string; amount: string }>(
    `
      select liquidation_item_id, amount::text as amount
      from countrify.iadmin_payments
      where liquidation_item_id = any($1::uuid[]) and is_void = false
    `,
    [itemIds],
  )
  for (const row of result.rows) {
    out.set(row.liquidation_item_id, (out.get(row.liquidation_item_id) ?? 0) + Number(row.amount))
  }
  return out
}

export async function getMostRecentPriorRunWithItemsFromPostgres(input: {
  managedPropertyId: string
  excludeRunId?: string | null
}): Promise<Array<{
  item_id: string
  unit_id: string
  ordinary_amount: string | null
  extraordinary_amount: string | null
  previous_balance: string | null
}>> {
  const priorRun = await pgQuery<{ id: string }>(
    `
      select id
      from countrify.iadmin_liquidation_runs
      where managed_property_id = $1
        and ($2::uuid is null or id <> $2)
        and status in ('calculated', 'issued', 'closed')
      order by generated_at desc
      limit 1
    `,
    [input.managedPropertyId, input.excludeRunId ?? null],
  )
  const runId = priorRun.rows[0]?.id
  if (!runId) return []

  const items = await pgQuery<{
    item_id: string
    unit_id: string
    ordinary_amount: string | null
    extraordinary_amount: string | null
    previous_balance: string | null
  }>(
    `
      select id as item_id, unit_id, ordinary_amount::text as ordinary_amount,
             extraordinary_amount::text as extraordinary_amount, previous_balance::text as previous_balance
      from countrify.iadmin_liquidation_items
      where liquidation_run_id = $1
    `,
    [runId],
  )
  return items.rows
}

export async function upsertLiquidationRunInPostgres(input: {
  administrationId: string
  managedPropertyId: string
  accountingPeriodId: string
  totalExpenses: number
  ordinaryTotal: number
  extraordinaryTotal: number
  previousBalance: number
  dueDates: unknown
  totalUnits: number
  generatedBy: string
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_liquidation_runs (
        administration_id, managed_property_id, accounting_period_id, status,
        total_expenses, ordinary_total, extraordinary_total, previous_balance,
        due_dates, total_units, generated_by, generated_at,
        issued_by, issued_at, closed_by, closed_at
      )
      values (
        $1, $2, $3, 'calculated'::iadmin_liquidation_status,
        $4, $5, $6, $7, $8::jsonb, $9, $10, now(),
        null, null, null, null
      )
      on conflict (managed_property_id, accounting_period_id) do update set
        status = 'calculated'::iadmin_liquidation_status,
        total_expenses = excluded.total_expenses,
        ordinary_total = excluded.ordinary_total,
        extraordinary_total = excluded.extraordinary_total,
        previous_balance = excluded.previous_balance,
        due_dates = excluded.due_dates,
        total_units = excluded.total_units,
        generated_by = excluded.generated_by,
        generated_at = now(),
        issued_by = null,
        issued_at = null,
        closed_by = null,
        closed_at = null
      returning id
    `,
    [
      input.administrationId,
      input.managedPropertyId,
      input.accountingPeriodId,
      input.totalExpenses,
      input.ordinaryTotal,
      input.extraordinaryTotal,
      input.previousBalance,
      JSON.stringify(input.dueDates),
      input.totalUnits,
      input.generatedBy,
    ],
  )
  return result.rows[0]
}

export async function deleteLiquidationItemsForRunInPostgres(runId: string): Promise<void> {
  await pgQuery(`delete from countrify.iadmin_liquidation_items where liquidation_run_id = $1`, [runId])
}

export async function bulkInsertLiquidationItemsInPostgres(
  items: Array<{
    liquidation_run_id: string
    unit_id: string
    prorata_coefficient: number
    amount: number
    ordinary_amount: number
    extraordinary_amount: number
    previous_balance: number
  }>,
): Promise<void> {
  if (items.length === 0) return
  const values: unknown[] = []
  const placeholders: string[] = []
  for (const item of items) {
    const idx = values.length
    values.push(
      item.liquidation_run_id,
      item.unit_id,
      item.prorata_coefficient,
      item.amount,
      item.ordinary_amount,
      item.extraordinary_amount,
      item.previous_balance,
    )
    placeholders.push(`($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7})`)
  }
  await pgQuery(
    `
      insert into countrify.iadmin_liquidation_items (
        liquidation_run_id, unit_id, prorata_coefficient, amount,
        ordinary_amount, extraordinary_amount, previous_balance
      )
      values ${placeholders.join(', ')}
    `,
    values,
  )
}

export async function updateLiquidationRunStatusInPostgres(input: {
  runId: string
  nextStatus: string
  actorProfileId: string
}): Promise<void> {
  if (input.nextStatus === 'issued') {
    await pgQuery(
      `
        update countrify.iadmin_liquidation_runs
        set status = $1::iadmin_liquidation_status,
            issued_at = now(),
            issued_by = $2,
            closed_at = null,
            closed_by = null
        where id = $3
      `,
      [input.nextStatus, input.actorProfileId, input.runId],
    )
  } else if (input.nextStatus === 'closed') {
    await pgQuery(
      `
        update countrify.iadmin_liquidation_runs
        set status = $1::iadmin_liquidation_status,
            closed_at = now(),
            closed_by = $2
        where id = $3
      `,
      [input.nextStatus, input.actorProfileId, input.runId],
    )
  } else {
    // draft / calculated → reset issued + closed
    await pgQuery(
      `
        update countrify.iadmin_liquidation_runs
        set status = $1::iadmin_liquidation_status,
            issued_at = null,
            issued_by = null,
            closed_at = null,
            closed_by = null
        where id = $2
      `,
      [input.nextStatus, input.runId],
    )
  }
}

// ----------------------------------------------------------------------------
// Reminders
// ----------------------------------------------------------------------------

export type ReminderItemRow = {
  run_id: string
  managed_property_id: string
  due_dates: any
  item_id: string
  ordinary_amount: string | null
  extraordinary_amount: string | null
  previous_balance: string | null
  unit_code: string | null
  holder_full_name: string | null
  holder_phone: string | null
}

export async function listReminderRunsWithItemsFromPostgres(input: {
  administrationId: string
  managedPropertyId?: string | null
}): Promise<ReminderItemRow[]> {
  const result = await pgQuery<ReminderItemRow>(
    `
      with chosen_holder as (
        select distinct on (h.unit_id)
          h.unit_id,
          h.full_name,
          h.phone,
          h.is_active
        from countrify.iadmin_unit_holders h
        order by h.unit_id, h.is_active desc, h.created_at asc
      )
      select
        r.id as run_id,
        r.managed_property_id,
        r.due_dates,
        i.id as item_id,
        i.ordinary_amount::text as ordinary_amount,
        i.extraordinary_amount::text as extraordinary_amount,
        i.previous_balance::text as previous_balance,
        u.code as unit_code,
        ch.full_name as holder_full_name,
        ch.phone as holder_phone
      from countrify.iadmin_liquidation_runs r
      inner join countrify.iadmin_liquidation_items i on i.liquidation_run_id = r.id
      left join countrify.iadmin_units u on u.id = i.unit_id
      left join chosen_holder ch on ch.unit_id = u.id
      where r.administration_id = $1
        and r.status in ('issued', 'closed')
        and ($2::uuid is null or r.managed_property_id = $2)
    `,
    [input.administrationId, input.managedPropertyId ?? null],
  )
  return result.rows
}

export async function sumLivePaymentsByItemsFromPostgres(
  runIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (runIds.length === 0) return out
  const result = await pgQuery<{ liquidation_item_id: string; amount: string }>(
    `
      select liquidation_item_id, amount::text as amount
      from countrify.iadmin_payments
      where liquidation_run_id = any($1::uuid[])
        and is_void = false
        and liquidation_item_id is not null
    `,
    [runIds],
  )
  for (const row of result.rows) {
    out.set(row.liquidation_item_id, (out.get(row.liquidation_item_id) ?? 0) + Number(row.amount))
  }
  return out
}

export async function listExistingRemindersTodayFromPostgres(input: {
  liquidationItemIds: string[]
  todayDate: string
}): Promise<Set<string>> {
  if (input.liquidationItemIds.length === 0) return new Set()
  const result = await pgQuery<{ liquidation_item_id: string; reminder_kind: string }>(
    `
      select liquidation_item_id, reminder_kind::text as reminder_kind
      from countrify.iadmin_reminders
      where liquidation_item_id = any($1::uuid[])
        and generated_at >= $2::timestamptz
    `,
    [input.liquidationItemIds, `${input.todayDate}T00:00:00Z`],
  )
  return new Set(result.rows.map((r: { liquidation_item_id: string; reminder_kind: string }) => `${r.liquidation_item_id}::${r.reminder_kind}`))
}

export async function insertReminderInPostgres(input: {
  administrationId: string
  managedPropertyId: string
  liquidationItemId: string
  reminderKind: string
  amountDue: number
  dueLabel: string
  dueDate: string
  messageBody: string
}): Promise<void> {
  await pgQuery(
    `
      insert into countrify.iadmin_reminders (
        administration_id, managed_property_id, liquidation_item_id, reminder_kind,
        status, amount_due, due_label, due_date, message_body
      )
      values ($1, $2, $3, $4::iadmin_reminder_kind, 'pending', $5, $6, $7::date, $8)
    `,
    [
      input.administrationId,
      input.managedPropertyId,
      input.liquidationItemId,
      input.reminderKind,
      input.amountDue,
      input.dueLabel,
      input.dueDate,
      input.messageBody,
    ],
  )
}

export async function getReminderAdminFromPostgres(
  reminderId: string,
): Promise<{ id: string; administration_id: string } | null> {
  const result = await pgQuery<{ id: string; administration_id: string }>(
    `select id, administration_id from countrify.iadmin_reminders where id = $1 limit 1`,
    [reminderId],
  )
  return result.rows[0] ?? null
}

export async function setReminderStatusInPostgres(input: {
  reminderId: string
  status: 'sent' | 'dismissed'
  actorProfileId: string
  notes?: string | null
}): Promise<void> {
  if (input.status === 'sent') {
    await pgQuery(
      `update countrify.iadmin_reminders set status = 'sent'::iadmin_reminder_status, sent_at = now(), sent_by = $1 where id = $2`,
      [input.actorProfileId, input.reminderId],
    )
  } else {
    await pgQuery(
      `
        update countrify.iadmin_reminders
        set status = 'dismissed'::iadmin_reminder_status,
            dismissed_at = now(),
            dismissed_by = $1,
            notes = coalesce($2, notes)
        where id = $3
      `,
      [input.actorProfileId, input.notes ?? null, input.reminderId],
    )
  }
}

export async function bulkUpdatePendingRemindersInPostgres(input: {
  administrationId: string
  reminderIds: string[]
  status: 'sent' | 'dismissed'
  actorProfileId: string
}): Promise<number> {
  if (input.reminderIds.length === 0) return 0
  if (input.status === 'sent') {
    const result = await pgQuery<{ id: string }>(
      `
        update countrify.iadmin_reminders
        set status = 'sent'::iadmin_reminder_status, sent_at = now(), sent_by = $1
        where administration_id = $2
          and id = any($3::uuid[])
          and status = 'pending'
        returning id
      `,
      [input.actorProfileId, input.administrationId, input.reminderIds],
    )
    return result.rows.length
  }
  const result = await pgQuery<{ id: string }>(
    `
      update countrify.iadmin_reminders
      set status = 'dismissed'::iadmin_reminder_status, dismissed_at = now(), dismissed_by = $1
      where administration_id = $2
        and id = any($3::uuid[])
        and status = 'pending'
      returning id
    `,
    [input.actorProfileId, input.administrationId, input.reminderIds],
  )
  return result.rows.length
}

// ----------------------------------------------------------------------------
// Reads para proyecciones / reportes
// ----------------------------------------------------------------------------

export async function getManagedPropertyForProjectionFromPostgres(propertyId: string): Promise<{
  id: string
  administration_id: string
  display_name: string | null
  management_fee_pct: string | null
  building_name: string
  total_units: number
} | null> {
  const result = await pgQuery<{
    id: string
    administration_id: string
    display_name: string | null
    management_fee_pct: string | null
    building_name: string
    total_units: number
  }>(
    `
      select
        mp.id,
        mp.administration_id,
        mp.display_name,
        mp.management_fee_pct::text as management_fee_pct,
        b.name as building_name,
        b.total_units
      from countrify.iadmin_managed_properties mp
      inner join countrify.buildings b on b.id = mp.building_id
      where mp.id = $1
      limit 1
    `,
    [propertyId],
  )
  return result.rows[0] ?? null
}

export async function listImputedExpensesForProjectionFromPostgres(input: {
  managedPropertyId: string
  fromDate: string
}): Promise<
  Array<{
    amount: string
    category: string | null
    expense_kind: string | null
    issued_at: string | null
    provider_name: string | null
  }>
> {
  const result = await pgQuery<{
    amount: string
    category: string | null
    expense_kind: string | null
    issued_at: string | null
    provider_name: string | null
  }>(
    `
      select
        e.amount::text as amount,
        e.category,
        e.expense_kind::text as expense_kind,
        e.issued_at::text as issued_at,
        p.name as provider_name
      from countrify.iadmin_expenses e
      left join countrify.iadmin_providers p on p.id = e.provider_id
      where e.managed_property_id = $1
        and e.issued_at >= $2::date
        and e.status in ('imputed', 'approved')
      order by e.issued_at asc
    `,
    [input.managedPropertyId, input.fromDate],
  )
  return result.rows
}

export async function listCashAccountsByPropertyFromPostgres(propertyId: string): Promise<
  Array<{ id: string; name: string; kind: string | null; is_active: boolean }>
> {
  const result = await pgQuery<{ id: string; name: string; kind: string | null; is_active: boolean }>(
    `select id, name, kind::text as kind, is_active from countrify.iadmin_cash_accounts where managed_property_id = $1`,
    [propertyId],
  )
  return result.rows
}

export async function sumBankMovementsForAccountsFromPostgres(accountIds: string[]): Promise<number> {
  if (accountIds.length === 0) return 0
  const result = await pgQuery<{ total: string }>(
    `select coalesce(sum(amount), 0)::text as total from countrify.iadmin_bank_movements where cash_account_id = any($1::uuid[])`,
    [accountIds],
  )
  return Number(result.rows[0]?.total ?? 0)
}

export async function listIssuedLiquidationRunsForProjectionFromPostgres(input: {
  managedPropertyId: string
  limit: number
}): Promise<
  Array<{
    id: string
    ordinary_total: string | null
    extraordinary_total: string | null
    period_year: number | null
    period_month: number | null
  }>
> {
  const result = await pgQuery<{
    id: string
    ordinary_total: string | null
    extraordinary_total: string | null
    period_year: number | null
    period_month: number | null
  }>(
    `
      select
        r.id,
        r.ordinary_total::text as ordinary_total,
        r.extraordinary_total::text as extraordinary_total,
        ap.period_year,
        ap.period_month
      from countrify.iadmin_liquidation_runs r
      left join countrify.iadmin_accounting_periods ap on ap.id = r.accounting_period_id
      where r.managed_property_id = $1 and r.status in ('issued', 'closed')
      order by r.generated_at desc
      limit $2
    `,
    [input.managedPropertyId, input.limit],
  )
  return result.rows
}

export async function listActivePaymentsForProjectionFromPostgres(propertyId: string): Promise<
  Array<{ amount: string; liquidation_run_id: string | null }>
> {
  const result = await pgQuery<{ amount: string; liquidation_run_id: string | null }>(
    `select amount::text as amount, liquidation_run_id from countrify.iadmin_payments where managed_property_id = $1 and is_void = false`,
    [propertyId],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Bank movements + payments (cobranzas)
// ----------------------------------------------------------------------------

export async function insertBankMovementInPostgres(input: {
  administrationId: string
  managedPropertyId: string
  cashAccountId: string
  movementDate: string
  description: string
  amount: number
  externalRef: string | null
  movementKind: string
  createdBy: string
  expenseId?: string | null
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_bank_movements (
        administration_id, managed_property_id, cash_account_id, movement_date,
        description, amount, external_ref, movement_kind, expense_id, created_by
      )
      values ($1, $2, $3, $4::date, $5, $6, $7, $8::iadmin_bank_movement_kind, $9, $10)
      returning id
    `,
    [
      input.administrationId,
      input.managedPropertyId,
      input.cashAccountId,
      input.movementDate,
      input.description,
      input.amount,
      input.externalRef,
      input.movementKind,
      input.expenseId ?? null,
      input.createdBy,
    ],
  )
  return result.rows[0]
}

export async function deleteBankMovementInPostgres(movementId: string): Promise<void> {
  await pgQuery(`delete from countrify.iadmin_bank_movements where id = $1`, [movementId])
}

export async function callIAdminNextReceiptNumberInPostgres(adminId: string): Promise<string> {
  const result = await pgQuery<{ result: string }>(
    `select countrify.iadmin_next_receipt_number(admin_id := $1) as result`,
    [adminId],
  )
  return result.rows[0].result
}

export async function insertCollectionPaymentInPostgres(input: {
  administrationId: string
  managedPropertyId: string
  liquidationRunId: string
  liquidationItemId: string
  unitId: string
  cashAccountId: string
  bankMovementId: string
  amount: number
  surchargeAmount: number
  paidAt: string
  method: string | null
  reference: string | null
  receiptNumber: string
  dueLabel: string | null
  notes: string | null
  createdBy: string
}): Promise<{ id: string; receipt_number: string }> {
  const result = await pgQuery<{ id: string; receipt_number: string }>(
    `
      insert into countrify.iadmin_payments (
        administration_id, managed_property_id, liquidation_run_id, liquidation_item_id,
        unit_id, cash_account_id, bank_movement_id, amount, surcharge_amount, paid_at,
        method, reference, receipt_number, due_label, notes, created_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $13, $14, $15, $16)
      returning id, receipt_number
    `,
    [
      input.administrationId,
      input.managedPropertyId,
      input.liquidationRunId,
      input.liquidationItemId,
      input.unitId,
      input.cashAccountId,
      input.bankMovementId,
      input.amount,
      input.surchargeAmount,
      input.paidAt,
      input.method,
      input.reference,
      input.receiptNumber,
      input.dueLabel,
      input.notes,
      input.createdBy,
    ],
  )
  return result.rows[0]
}

export async function getPaymentForVoidFromPostgres(paymentId: string): Promise<{
  id: string
  administration_id: string
  managed_property_id: string
  liquidation_run_id: string | null
  bank_movement_id: string | null
  is_void: boolean
} | null> {
  const result = await pgQuery<{
    id: string
    administration_id: string
    managed_property_id: string
    liquidation_run_id: string | null
    bank_movement_id: string | null
    is_void: boolean
  }>(
    `
      select id, administration_id, managed_property_id, liquidation_run_id, bank_movement_id, is_void
      from countrify.iadmin_payments
      where id = $1
      limit 1
    `,
    [paymentId],
  )
  return result.rows[0] ?? null
}

export async function voidPaymentInPostgres(input: {
  paymentId: string
  voidedBy: string
  reason: string
}): Promise<void> {
  await pgQuery(
    `
      update countrify.iadmin_payments
      set is_void = true,
          voided_at = now(),
          voided_by = $1,
          void_reason = $2
      where id = $3
    `,
    [input.voidedBy, input.reason, input.paymentId],
  )
}
