import { pgQuery } from '@/lib/db/postgres'

export interface IAdminAdministrationRow {
  id: string
  name: string
  legal_name: string | null
  tax_id: string | null
  contact_email: string | null
  contact_phone: string | null
  is_active: boolean
  legal_info: Record<string, unknown> | null
  created_at: string
}

export interface IAdminRoleGrantRow {
  administration_id: string
  operational_role: string
  is_primary: boolean
  created_at: string
  admin_id: string
  admin_name: string
  admin_legal_name: string | null
  admin_tax_id: string | null
  admin_contact_email: string | null
  admin_contact_phone: string | null
  admin_is_active: boolean
  admin_legal_info: Record<string, unknown> | null
  admin_created_at: string
}

export interface IAdminRoleCapabilityOverrideRow {
  administration_id: string
  operational_role: string
  capability_code: string
  granted: boolean
}

export interface IAdminManagedPropertyRow {
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
  legal_info: Record<string, unknown> | null
  created_at: string
  building_name: string
  building_address: string | null
  total_units: number | null
}

export interface IAdminPortfolioStatsRow {
  open_expenses_count: number
  pending_docs_count: number
}

export interface IAdminProviderRow {
  id: string
  administration_id: string
  name: string
  tax_id: string | null
  category: string | null
  email: string | null
  phone: string | null
  notes: string | null
  default_category: string | null
  default_description: string | null
  is_recurring: boolean
  recurring_amount: string | null
  recurring_kind: string | null
  is_active: boolean
  created_at: string
}

export interface IAdminExpenseInboxRow {
  id: string
  administration_id: string
  managed_property_id: string
  provider_name: string | null
  property_display_name: string | null
  building_name: string | null
  category: string | null
  description: string
  amount: string
  currency: string | null
  issued_at: string | null
  status: string
  expense_kind: string | null
  created_at: string
  document_count: number
  pending_extraction_count: number
}

export interface IAdminPortfolioOverviewPropertyRow {
  property_id: string
  total_balance: string | null
  pending_expenses: number
  accounts_payable_total: string | null
  overdue_amount: string | null
  current_month_liquidated: string | null
  current_month_collected: string | null
  collection_rate_pct: number | null
  has_open_period: boolean
  run_status_this_month: string | null
}

export interface ConsorcioAssignmentRow {
  id: string
  profile_id: string
  building_id: string
  is_primary: boolean
  created_at: string
}

export interface ConsorcioBuildingRow {
  id: string
  name: string
  address: string | null
  latitude: string | null
  longitude: string | null
  total_units: number | null
  created_at: string
}

export interface ConsorcioNeighborRow {
  id: string
  email: string | null
  full_name: string | null
  role: string
  avatar_text: string | null
  building_id: string | null
  floor: string | null
  unit: string | null
  phone: string | null
  created_at: string
}

export interface ConsorcioAdminMentionRow {
  building_id: string
  profile: {
    id: string
    full_name: string | null
    role: string
    floor: string | null
    unit: string | null
  } | null
}

export interface ConsorcioComplaintCaseRow {
  id: string
  case_code: string
  building_id: string
  author_profile_id: string | null
  title: string
  description: string
  status: string
  other_reason_text: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  closed_at: string | null
  buildings: { id: string; name: string | null } | null
  profiles: { id: string; full_name: string | null; email: string | null; avatar_text: string | null; floor: string | null; unit: string | null } | null
  complaint_case_reasons: Array<{
    complaint_reason_catalog: { id: string; slug: string; label: string; is_other: boolean } | null
  }>
  complaint_case_messages: Array<{
    id: string
    case_id: string
    message: string
    message_type: string
    created_at: string
    author_label: string | null
    author_role: string | null
    profiles: { id: string; full_name: string | null; avatar_text: string | null; role: string | null; floor: string | null; unit: string | null } | null
    complaint_case_message_mentions: Array<{
      id: string
      message_id: string
      mentioned_profile_id: string
      profiles: { id: string; full_name: string | null; role: string | null; floor: string | null; unit: string | null } | null
    }>
  }>
  complaint_case_events: Array<{
    id: string
    case_id: string
    event_type: string
    actor_label: string | null
    actor_role: string | null
    summary: string
    metadata: Record<string, unknown> | null
    created_at: string
  }>
}

export interface UnitProfileMembershipRow {
  id: string
  unit_id: string
  building_id: string
  profile_id: string
  relationship_type: string
  is_primary: boolean
  active: boolean
  created_by_profile_id: string | null
  created_at: string
  profiles: {
    id: string
    email: string | null
    full_name: string | null
    role: string
    avatar_text: string | null
    building_id: string | null
    floor: string | null
    unit: string | null
    phone: string | null
    created_at: string
  } | null
  iadmin_units: {
    id: string
    code: string | null
    floor: string | null
    kind?: string | null
    iadmin_managed_properties: {
      id?: string
      display_name?: string | null
      buildings: {
        id: string
        name: string | null
        address?: string | null
      } | null
    } | null
  } | null
}

export interface BuildingInformationRow {
  id: string
  building_id: string
  title: string
  category: string | null
  content: string
  visible_to: string | null
  sort_order: number | null
  is_active: boolean
  created_at: string
  updated_at: string | null
}

export interface OwnerLiquidationItemRow {
  id: string
  unit_id: string
  prorata_coefficient: string | null
  amount: string | null
  ordinary_amount: string | null
  extraordinary_amount: string | null
  previous_balance: string | null
  iadmin_units: {
    id: string
    code: string | null
    kind: string | null
    iadmin_unit_holders: Array<{
      id: string
      full_name: string | null
      holder_kind: string | null
      is_active: boolean
    }>
  } | null
  iadmin_liquidation_runs: {
    id: string
    period_year: number
    period_month: number
    status: string
    generated_at: string | null
  } | null
}

export interface OwnerPaymentRow {
  id: string
  administration_id: string
  managed_property_id: string
  liquidation_run_id: string | null
  liquidation_item_id: string | null
  unit_id: string | null
  cash_account_id: string | null
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
  iadmin_units: { id: string; code: string | null } | null
  iadmin_cash_accounts: { id: string; name: string | null } | null
}

export interface IAdminUnitRow {
  id: string
  managed_property_id: string
  code: string
  kind: string | null
  floor: string | null
  surface_m2: string | null
  prorata_coefficient: string | null
  is_active: boolean
  iadmin_unit_holders: Array<{
    id: string
    full_name: string | null
    holder_kind: string | null
    is_active: boolean
  }>
}

export interface IAdminAccountingPeriodRow {
  id: string
  managed_property_id: string
  period_year: number
  period_month: number
  status: string
  closed_at: string | null
}

export interface IAdminRecentExpenseRow {
  id: string
  administration_id: string
  managed_property_id: string
  provider_name: string | null
  category: string | null
  description: string
  amount: string
  currency: string | null
  issued_at: string | null
  status: string
  expense_kind: string | null
  created_at: string
  document_count: number
  pending_extraction_count: number
}

export async function getIAdminAdministrationsFromPostgres(activeOnly = false): Promise<IAdminAdministrationRow[]> {
  const params: unknown[] = []
  const where = activeOnly ? 'where a.is_active = true' : ''
  const result = await pgQuery<IAdminAdministrationRow>(
    `
      select
        a.id,
        a.name,
        a.legal_name,
        a.tax_id,
        a.contact_email,
        a.contact_phone,
        a.is_active,
        a.legal_info,
        a.created_at::text as created_at
      from countrify.iadmin_administrations a
      ${where}
      order by a.name asc
    `,
    params,
  )

  return result.rows
}

export async function getConsorcioAssignmentsForProfileFromPostgres(
  profileId: string,
): Promise<ConsorcioAssignmentRow[]> {
  const result = await pgQuery<ConsorcioAssignmentRow>(
    `
      select
        id,
        profile_id,
        building_id,
        is_primary,
        created_at::text as created_at
      from countrify.building_admin_assignments
      where profile_id = $1
      order by is_primary desc, created_at asc
    `,
    [profileId],
  )

  return result.rows
}

export async function getConsorcioBuildingsByIdsFromPostgres(
  buildingIds: string[],
): Promise<ConsorcioBuildingRow[]> {
  if (buildingIds.length === 0) return []

  const result = await pgQuery<ConsorcioBuildingRow>(
    `
      select
        id,
        name,
        address,
        latitude::text as latitude,
        longitude::text as longitude,
        total_units,
        created_at::text as created_at
      from countrify.buildings
      where id = any($1::uuid[])
      order by name asc
    `,
    [buildingIds],
  )

  return result.rows
}

export async function getConsorcioNeighborsByBuildingIdsFromPostgres(
  buildingIds: string[],
): Promise<ConsorcioNeighborRow[]> {
  if (buildingIds.length === 0) return []

  const result = await pgQuery<ConsorcioNeighborRow>(
    `
      select
        id,
        email,
        full_name,
        role::text as role,
        avatar_text,
        building_id,
        floor,
        unit,
        phone,
        created_at::text as created_at
      from countrify.profiles
      where role = 'vecino'
        and building_id = any($1::uuid[])
      order by full_name asc nulls last
    `,
    [buildingIds],
  )

  return result.rows
}

export async function getConsorcioAdminMentionablesByBuildingIdsFromPostgres(
  buildingIds: string[],
): Promise<ConsorcioAdminMentionRow[]> {
  if (buildingIds.length === 0) return []

  const result = await pgQuery<ConsorcioAdminMentionRow>(
    `
      select
        baa.building_id,
        json_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'role', p.role::text,
          'floor', p.floor,
          'unit', p.unit
        ) as profile
      from countrify.building_admin_assignments baa
      inner join countrify.profiles p on p.id = baa.profile_id
      where baa.building_id = any($1::uuid[])
    `,
    [buildingIds],
  )

  return result.rows
}

export async function getConsorcioComplaintCasesByBuildingIdsFromPostgres(
  buildingIds: string[],
): Promise<ConsorcioComplaintCaseRow[]> {
  if (buildingIds.length === 0) return []

  const result = await pgQuery<ConsorcioComplaintCaseRow>(
    `
      select
        cc.id,
        cc.case_code,
        cc.building_id,
        cc.author_profile_id,
        cc.title,
        cc.description,
        cc.status::text as status,
        cc.other_reason_text,
        cc.created_at::text as created_at,
        cc.updated_at::text as updated_at,
        cc.resolved_at::text as resolved_at,
        cc.closed_at::text as closed_at,
        json_build_object('id', b.id, 'name', b.name) as buildings,
        json_build_object(
          'id', author.id,
          'full_name', author.full_name,
          'email', author.email,
          'avatar_text', author.avatar_text,
          'floor', author.floor,
          'unit', author.unit
        ) as profiles,
        coalesce((
          select json_agg(
            json_build_object(
              'complaint_reason_catalog',
              json_build_object(
                'id', crc.id,
                'slug', crc.slug,
                'label', crc.label,
                'is_other', crc.is_other
              )
            )
            order by crc.label asc
          )
          from countrify.complaint_case_reasons ccr
          inner join countrify.complaint_reason_catalog crc on crc.id = ccr.reason_id
          where ccr.case_id = cc.id
        ), '[]'::json) as complaint_case_reasons,
        coalesce((
          select json_agg(
            json_build_object(
              'id', m.id,
              'case_id', m.case_id,
              'message', m.message,
              'message_type', m.message_type::text,
              'created_at', m.created_at::text,
              'author_label', m.author_label,
              'author_role', m.author_role,
              'profiles', json_build_object(
                'id', mp.id,
                'full_name', mp.full_name,
                'avatar_text', mp.avatar_text,
                'role', mp.role::text,
                'floor', mp.floor,
                'unit', mp.unit
              ),
              'complaint_case_message_mentions', coalesce((
                select json_agg(
                  json_build_object(
                    'id', mm.id,
                    'message_id', mm.message_id,
                    'mentioned_profile_id', mm.mentioned_profile_id,
                    'profiles', json_build_object(
                      'id', mentioned.id,
                      'full_name', mentioned.full_name,
                      'role', mentioned.role::text,
                      'floor', mentioned.floor,
                      'unit', mentioned.unit
                    )
                  )
                  order by mm.created_at asc
                )
                from countrify.complaint_case_message_mentions mm
                left join countrify.profiles mentioned on mentioned.id = mm.mentioned_profile_id
                where mm.message_id = m.id
              ), '[]'::json)
            )
            order by m.created_at asc
          )
          from countrify.complaint_case_messages m
          left join countrify.profiles mp on mp.id = m.author_profile_id
          where m.case_id = cc.id
        ), '[]'::json) as complaint_case_messages,
        coalesce((
          select json_agg(
            json_build_object(
              'id', e.id,
              'case_id', e.case_id,
              'event_type', e.event_type::text,
              'actor_label', e.actor_label,
              'actor_role', e.actor_role,
              'summary', e.summary,
              'metadata', e.metadata,
              'created_at', e.created_at::text
            )
            order by e.created_at asc
          )
          from countrify.complaint_case_events e
          where e.case_id = cc.id
        ), '[]'::json) as complaint_case_events
      from countrify.complaint_cases cc
      inner join countrify.buildings b on b.id = cc.building_id
      left join countrify.profiles author on author.id = cc.author_profile_id
      where cc.building_id = any($1::uuid[])
      order by cc.created_at desc
    `,
    [buildingIds],
  )

  return result.rows
}

export async function getUnitProfileMembershipsForProfileFromPostgres(
  profileId: string,
  relationshipType?: string,
): Promise<UnitProfileMembershipRow[]> {
  const values: unknown[] = [profileId]
  const relationshipFilter = relationshipType ? `and upm.relationship_type = $2` : ''
  if (relationshipType) values.push(relationshipType)

  const result = await pgQuery<UnitProfileMembershipRow>(
    `
      select
        upm.id,
        upm.unit_id,
        upm.building_id,
        upm.profile_id,
        upm.relationship_type::text as relationship_type,
        upm.is_primary,
        upm.active,
        upm.created_by_profile_id,
        upm.created_at::text as created_at,
        json_build_object(
          'id', p.id,
          'email', p.email,
          'full_name', p.full_name,
          'role', p.role::text,
          'avatar_text', p.avatar_text,
          'building_id', p.building_id,
          'floor', p.floor,
          'unit', p.unit,
          'phone', p.phone,
          'created_at', p.created_at::text
        ) as profiles,
        json_build_object(
          'id', u.id,
          'code', u.code,
          'floor', u.floor,
          'kind', u.kind::text,
          'iadmin_managed_properties', json_build_object(
            'id', mp.id,
            'display_name', mp.display_name,
            'buildings', json_build_object(
              'id', b.id,
              'name', b.name,
              'address', b.address
            )
          )
        ) as iadmin_units
      from countrify.unit_profile_memberships upm
      inner join countrify.profiles p on p.id = upm.profile_id
      inner join countrify.iadmin_units u on u.id = upm.unit_id
      left join countrify.iadmin_managed_properties mp on mp.id = u.managed_property_id
      left join countrify.buildings b on b.id = mp.building_id
      where upm.profile_id = $1
        and upm.active = true
        ${relationshipFilter}
      order by upm.is_primary desc, upm.created_at asc
    `,
    values,
  )

  return result.rows
}

export async function getBuildingInformationByBuildingIdsFromPostgres(
  buildingIds: string[],
  visibleTo?: string[],
): Promise<BuildingInformationRow[]> {
  if (buildingIds.length === 0) return []

  const values: unknown[] = [buildingIds]
  let visibleFilter = ''
  if (visibleTo && visibleTo.length > 0) {
    values.push(visibleTo)
    visibleFilter = `and bi.visible_to = any($2::text[])`
  }

  const result = await pgQuery<BuildingInformationRow>(
    `
      select
        bi.id,
        bi.building_id,
        bi.title,
        bi.category,
        bi.content,
        bi.visible_to,
        bi.sort_order,
        bi.is_active,
        bi.created_at::text as created_at,
        bi.updated_at::text as updated_at
      from countrify.building_information bi
      where bi.building_id = any($1::uuid[])
        and bi.is_active = true
        ${visibleFilter}
      order by bi.sort_order asc, bi.created_at desc
    `,
    values,
  )

  return result.rows
}

export async function getOwnerLiquidationItemsByUnitIdsFromPostgres(
  unitIds: string[],
): Promise<OwnerLiquidationItemRow[]> {
  if (unitIds.length === 0) return []

  const result = await pgQuery<OwnerLiquidationItemRow>(
    `
      select
        li.id,
        li.unit_id,
        li.prorata_coefficient::text as prorata_coefficient,
        li.amount::text as amount,
        li.ordinary_amount::text as ordinary_amount,
        li.extraordinary_amount::text as extraordinary_amount,
        li.previous_balance::text as previous_balance,
        json_build_object(
          'id', u.id,
          'code', u.code,
          'kind', u.kind::text,
          'iadmin_unit_holders', coalesce((
            select json_agg(
              json_build_object(
                'id', h.id,
                'full_name', h.full_name,
                'holder_kind', h.holder_kind::text,
                'is_active', h.is_active
              )
              order by h.is_active desc, h.created_at asc
            )
            from countrify.iadmin_unit_holders h
            where h.unit_id = u.id
          ), '[]'::json)
        ) as iadmin_units,
        json_build_object(
          'id', lr.id,
          'period_year', lr.period_year,
          'period_month', lr.period_month,
          'status', lr.status::text,
          'generated_at', lr.generated_at::text
        ) as iadmin_liquidation_runs
      from countrify.iadmin_liquidation_items li
      inner join countrify.iadmin_units u on u.id = li.unit_id
      inner join countrify.iadmin_liquidation_runs lr on lr.id = li.liquidation_run_id
      where li.unit_id = any($1::uuid[])
      order by lr.generated_at desc nulls last
    `,
    [unitIds],
  )

  return result.rows
}

export async function getOwnerPaymentsByUnitIdsFromPostgres(
  unitIds: string[],
): Promise<OwnerPaymentRow[]> {
  if (unitIds.length === 0) return []

  const result = await pgQuery<OwnerPaymentRow>(
    `
      select
        p.id,
        p.administration_id,
        p.managed_property_id,
        p.liquidation_run_id,
        p.liquidation_item_id,
        p.unit_id,
        p.cash_account_id,
        p.bank_movement_id,
        p.amount::text as amount,
        p.surcharge_amount::text as surcharge_amount,
        p.paid_at::text as paid_at,
        p.method,
        p.reference,
        p.receipt_number,
        p.due_label,
        p.notes,
        p.is_void,
        p.voided_at::text as voided_at,
        p.void_reason,
        p.created_at::text as created_at,
        json_build_object('id', u.id, 'code', u.code) as iadmin_units,
        json_build_object('id', ca.id, 'name', ca.name) as iadmin_cash_accounts
      from countrify.iadmin_payments p
      left join countrify.iadmin_units u on u.id = p.unit_id
      left join countrify.iadmin_cash_accounts ca on ca.id = p.cash_account_id
      where p.unit_id = any($1::uuid[])
        and p.is_void = false
      order by p.paid_at desc
    `,
    [unitIds],
  )

  return result.rows
}

export async function getIAdminManagedPropertyByIdFromPostgres(
  propertyId: string,
): Promise<IAdminManagedPropertyRow | null> {
  const result = await pgQuery<IAdminManagedPropertyRow>(
    `
      select
        mp.id,
        mp.administration_id,
        mp.building_id,
        mp.display_name,
        mp.property_kind::text as property_kind,
        mp.tax_id,
        mp.managed_since::text as managed_since,
        mp.management_fee_pct::text as management_fee_pct,
        mp.notes,
        mp.is_active,
        mp.legal_info,
        mp.created_at::text as created_at,
        b.name as building_name,
        b.address as building_address,
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

export async function getIAdminUnitsByPropertyFromPostgres(
  propertyId: string,
): Promise<IAdminUnitRow[]> {
  const result = await pgQuery<IAdminUnitRow>(
    `
      select
        u.id,
        u.managed_property_id,
        u.code,
        u.kind::text as kind,
        u.floor,
        u.surface_m2::text as surface_m2,
        u.prorata_coefficient::text as prorata_coefficient,
        u.is_active,
        coalesce((
          select json_agg(
            json_build_object(
              'id', h.id,
              'full_name', h.full_name,
              'holder_kind', h.holder_kind::text,
              'is_active', h.is_active
            )
            order by h.is_active desc, h.created_at asc
          )
          from countrify.iadmin_unit_holders h
          where h.unit_id = u.id
        ), '[]'::json) as iadmin_unit_holders
      from countrify.iadmin_units u
      where u.managed_property_id = $1
      order by u.code asc
    `,
    [propertyId],
  )

  return result.rows
}

export async function getIAdminAccountingPeriodForPropertyMonthFromPostgres(
  propertyId: string,
  year: number,
  month: number,
): Promise<IAdminAccountingPeriodRow | null> {
  const result = await pgQuery<IAdminAccountingPeriodRow>(
    `
      select
        id,
        managed_property_id,
        period_year,
        period_month,
        status::text as status,
        closed_at::text as closed_at
      from countrify.iadmin_accounting_periods
      where managed_property_id = $1
        and period_year = $2
        and period_month = $3
      limit 1
    `,
    [propertyId, year, month],
  )

  return result.rows[0] ?? null
}

export async function getIAdminRecentExpensesByPropertyFromPostgres(
  propertyId: string,
  limit = 10,
): Promise<IAdminRecentExpenseRow[]> {
  const result = await pgQuery<IAdminRecentExpenseRow>(
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
        e.status::text as status,
        e.expense_kind::text as expense_kind,
        e.created_at::text as created_at,
        count(distinct d.id)::int as document_count,
        count(distinct case when ex.status <> 'validated' then ex.id end)::int as pending_extraction_count
      from countrify.iadmin_expenses e
      left join countrify.iadmin_providers p on p.id = e.provider_id
      left join countrify.iadmin_expense_documents d on d.expense_id = e.id
      left join countrify.iadmin_ai_document_extractions ex on ex.document_id = d.id
      where e.managed_property_id = $1
      group by
        e.id,
        e.administration_id,
        e.managed_property_id,
        p.name,
        e.category,
        e.description,
        e.amount,
        e.currency,
        e.issued_at,
        e.status,
        e.expense_kind,
        e.created_at
      order by e.created_at desc
      limit $2
    `,
    [propertyId, limit],
  )

  return result.rows
}

export async function countActiveUnitHoldersByPropertyFromPostgres(
  propertyId: string,
): Promise<number> {
  const result = await pgQuery<{ count: number }>(
    `
      select count(*)::int as count
      from countrify.iadmin_unit_holders h
      inner join countrify.iadmin_units u on u.id = h.unit_id
      where h.is_active = true
        and u.managed_property_id = $1
    `,
    [propertyId],
  )

  return Number(result.rows[0]?.count ?? 0)
}

export async function getIAdminRoleGrantsForProfileFromPostgres(profileId: string): Promise<IAdminRoleGrantRow[]> {
  const result = await pgQuery<IAdminRoleGrantRow>(
    `
      select
        g.administration_id,
        g.operational_role,
        g.is_primary,
        g.created_at::text as created_at,
        a.id as admin_id,
        a.name as admin_name,
        a.legal_name as admin_legal_name,
        a.tax_id as admin_tax_id,
        a.contact_email as admin_contact_email,
        a.contact_phone as admin_contact_phone,
        a.is_active as admin_is_active,
        a.legal_info as admin_legal_info,
        a.created_at::text as admin_created_at
      from countrify.iadmin_role_grants g
      inner join countrify.iadmin_administrations a on a.id = g.administration_id
      where g.profile_id = $1
      order by g.is_primary desc, g.created_at asc
    `,
    [profileId],
  )

  return result.rows
}

export async function getIAdminRoleCapabilityOverridesFromPostgres(
  administrationIds: string[],
): Promise<IAdminRoleCapabilityOverrideRow[]> {
  if (administrationIds.length === 0) return []

  const result = await pgQuery<IAdminRoleCapabilityOverrideRow>(
    `
      select
        administration_id,
        operational_role,
        capability_code,
        granted
      from countrify.iadmin_role_capabilities
      where administration_id = any($1::uuid[])
    `,
    [administrationIds],
  )

  return result.rows
}

export async function getIAdminAdministrationByIdFromPostgres(id: string): Promise<IAdminAdministrationRow | null> {
  const result = await pgQuery<IAdminAdministrationRow>(
    `
      select
        a.id,
        a.name,
        a.legal_name,
        a.tax_id,
        a.contact_email,
        a.contact_phone,
        a.is_active,
        a.legal_info,
        a.created_at::text as created_at
      from countrify.iadmin_administrations a
      where a.id = $1
      limit 1
    `,
    [id],
  )

  return result.rows[0] ?? null
}

export async function getIAdminManagedPropertiesByAdministrationFromPostgres(
  administrationId: string,
): Promise<IAdminManagedPropertyRow[]> {
  const result = await pgQuery<IAdminManagedPropertyRow>(
    `
      select
        mp.id,
        mp.administration_id,
        mp.building_id,
        mp.display_name,
        mp.property_kind::text as property_kind,
        mp.tax_id,
        mp.managed_since::text as managed_since,
        mp.management_fee_pct::text as management_fee_pct,
        mp.notes,
        mp.is_active,
        mp.legal_info,
        mp.created_at::text as created_at,
        b.name as building_name,
        b.address as building_address,
        b.total_units
      from countrify.iadmin_managed_properties mp
      inner join countrify.buildings b on b.id = mp.building_id
      where mp.administration_id = $1
        and mp.is_active = true
      order by mp.created_at asc
    `,
    [administrationId],
  )

  return result.rows
}

export async function getIAdminPortfolioStatsFromPostgres(
  administrationId: string,
): Promise<IAdminPortfolioStatsRow> {
  const result = await pgQuery<IAdminPortfolioStatsRow>(
    `
      select
        (
          select count(*)::int
          from countrify.iadmin_expenses e
          where e.administration_id = $1
            and e.status in ('draft', 'pending_review', 'needs_doc')
        ) as open_expenses_count,
        (
          select count(*)::int
          from countrify.iadmin_ai_document_extractions ex
          inner join countrify.iadmin_expense_documents d on d.id = ex.document_id
          inner join countrify.iadmin_expenses e on e.id = d.expense_id
          where e.administration_id = $1
            and ex.status <> 'validated'
        ) as pending_docs_count
    `,
    [administrationId],
  )

  return (
    result.rows[0] ?? {
      open_expenses_count: 0,
      pending_docs_count: 0,
    }
  )
}

export async function getIAdminProvidersFromPostgres(administrationId: string): Promise<IAdminProviderRow[]> {
  const result = await pgQuery<IAdminProviderRow>(
    `
      select
        id,
        administration_id,
        name,
        tax_id,
        category,
        email,
        phone,
        notes,
        default_category,
        default_description,
        is_recurring,
        recurring_amount::text as recurring_amount,
        recurring_kind::text as recurring_kind,
        is_active,
        created_at::text as created_at
      from countrify.iadmin_providers
      where administration_id = $1
      order by is_active desc, name asc
    `,
    [administrationId],
  )

  return result.rows
}

export async function getIAdminExpensesInboxFromPostgres(
  administrationId: string,
): Promise<IAdminExpenseInboxRow[]> {
  const result = await pgQuery<IAdminExpenseInboxRow>(
    `
      select
        e.id,
        e.administration_id,
        e.managed_property_id,
        p.name as provider_name,
        mp.display_name as property_display_name,
        b.name as building_name,
        e.category,
        e.description,
        e.amount::text as amount,
        e.currency,
        e.issued_at::text as issued_at,
        e.status::text as status,
        e.expense_kind::text as expense_kind,
        e.created_at::text as created_at,
        count(distinct d.id)::int as document_count,
        count(distinct case when ex.status <> 'validated' then ex.id end)::int as pending_extraction_count
      from countrify.iadmin_expenses e
      left join countrify.iadmin_providers p on p.id = e.provider_id
      left join countrify.iadmin_managed_properties mp on mp.id = e.managed_property_id
      left join countrify.buildings b on b.id = mp.building_id
      left join countrify.iadmin_expense_documents d on d.expense_id = e.id
      left join countrify.iadmin_ai_document_extractions ex on ex.document_id = d.id
      where e.administration_id = $1
      group by
        e.id,
        e.administration_id,
        e.managed_property_id,
        p.name,
        mp.display_name,
        b.name,
        e.category,
        e.description,
        e.amount,
        e.currency,
        e.issued_at,
        e.status,
        e.expense_kind,
        e.created_at
      order by e.created_at desc
      limit 50
    `,
    [administrationId],
  )

  return result.rows
}

export async function getIAdminProviderByIdFromPostgres(
  providerId: string,
): Promise<{ id: string; administration_id: string } | null> {
  const result = await pgQuery<{ id: string; administration_id: string }>(
    `select id, administration_id from countrify.iadmin_providers where id = $1 limit 1`,
    [providerId],
  )
  return result.rows[0] ?? null
}

export async function createIAdminProviderInPostgres(input: {
  administrationId: string
  name: string
  taxId: string | null
  category: string | null
  email: string | null
  phone: string | null
  notes: string | null
  isRecurring: boolean
  recurringAmount: number | null
  recurringKind: 'ordinaria' | 'extraordinaria'
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.iadmin_providers (
        administration_id, name, tax_id, category, email, phone, notes,
        is_recurring, recurring_amount, recurring_kind, is_active
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::iadmin_expense_kind, true)
      returning id
    `,
    [
      input.administrationId,
      input.name,
      input.taxId,
      input.category,
      input.email,
      input.phone,
      input.notes,
      input.isRecurring,
      input.recurringAmount,
      input.recurringKind,
    ],
  )
  return { id: result.rows[0].id }
}

export async function updateIAdminProviderInPostgres(
  providerId: string,
  patch: Partial<{
    name: string
    taxId: string | null
    category: string | null
    email: string | null
    phone: string | null
    notes: string | null
    isRecurring: boolean
    recurringAmount: number | null
    recurringKind: 'ordinaria' | 'extraordinaria'
    isActive: boolean
  }>,
): Promise<void> {
  const columns: string[] = []
  const values: unknown[] = []
  const map: Record<string, { col: string; cast?: string }> = {
    name: { col: 'name' },
    taxId: { col: 'tax_id' },
    category: { col: 'category' },
    email: { col: 'email' },
    phone: { col: 'phone' },
    notes: { col: 'notes' },
    isRecurring: { col: 'is_recurring' },
    recurringAmount: { col: 'recurring_amount' },
    recurringKind: { col: 'recurring_kind', cast: 'iadmin_expense_kind' },
    isActive: { col: 'is_active' },
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const meta = map[key]
    if (!meta) continue
    values.push(value)
    columns.push(meta.cast ? `${meta.col} = $${values.length}::${meta.cast}` : `${meta.col} = $${values.length}`)
  }

  if (columns.length === 0) return

  values.push(providerId)
  await pgQuery(
    `update countrify.iadmin_providers set ${columns.join(', ')} where id = $${values.length}`,
    values,
  )
}

export async function insertIAdminAuditLogInPostgres(input: {
  administrationId: string
  actorProfileId: string
  entityType: string
  entityId: string | null
  action: string
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  await pgQuery(
    `
      insert into countrify.iadmin_audit_logs (
        administration_id, actor_profile_id, entity_type, entity_id, action, metadata
      )
      values ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      input.administrationId,
      input.actorProfileId,
      input.entityType,
      input.entityId,
      input.action,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  )
}

export async function getIAdminPortfolioOverviewRowsFromPostgres(
  administrationId: string,
  currentYear: number,
  currentMonth: number,
): Promise<IAdminPortfolioOverviewPropertyRow[]> {
  const result = await pgQuery<IAdminPortfolioOverviewPropertyRow>(
    `
      with props as (
        select mp.id
        from countrify.iadmin_managed_properties mp
        where mp.administration_id = $1
          and mp.is_active = true
      ),
      active_accounts as (
        select ca.id, ca.managed_property_id
        from countrify.iadmin_cash_accounts ca
        where ca.managed_property_id in (select id from props)
          and ca.is_active = true
      ),
      balances as (
        select
          aa.managed_property_id as property_id,
          coalesce(sum(bm.amount), 0) as total_balance
        from active_accounts aa
        left join countrify.iadmin_bank_movements bm on bm.cash_account_id = aa.id
        group by aa.managed_property_id
      ),
      expenses as (
        select
          e.id,
          e.managed_property_id,
          e.status::text as status,
          e.amount
        from countrify.iadmin_expenses e
        where e.managed_property_id in (select id from props)
      ),
      paid_expenses as (
        select distinct bm.expense_id
        from countrify.iadmin_bank_movements bm
        where bm.movement_kind = 'expense_payment'
          and bm.expense_id is not null
      ),
      expense_rollup as (
        select
          e.managed_property_id as property_id,
          count(*) filter (where e.status in ('pending_review', 'needs_doc'))::int as pending_expenses,
          coalesce(sum(case when e.status in ('approved', 'imputed') and pe.expense_id is null then e.amount else 0 end), 0) as accounts_payable_total
        from expenses e
        left join paid_expenses pe on pe.expense_id = e.id
        group by e.managed_property_id
      ),
      current_periods as (
        select
          ap.managed_property_id as property_id,
          bool_or(ap.status = 'open') as has_open_period
        from countrify.iadmin_accounting_periods ap
        where ap.managed_property_id in (select id from props)
          and ap.period_year = $2
          and ap.period_month = $3
        group by ap.managed_property_id
      ),
      runs as (
        select
          lr.id,
          lr.managed_property_id as property_id,
          lr.status::text as status,
          lr.ordinary_total,
          lr.extraordinary_total,
          ap.period_year,
          ap.period_month
        from countrify.iadmin_liquidation_runs lr
        inner join countrify.iadmin_accounting_periods ap on ap.id = lr.accounting_period_id
        where lr.managed_property_id in (select id from props)
          and lr.status in ('calculated', 'issued', 'closed')
      ),
      run_payments as (
        select
          liquidation_run_id as run_id,
          coalesce(sum(amount), 0) as collected
        from countrify.iadmin_payments
        where liquidation_run_id in (select id from runs)
          and is_void = false
        group by liquidation_run_id
      ),
      historical_item_overdue as (
        select
          r.property_id,
          coalesce(sum(greatest(
            0,
            coalesce(li.ordinary_amount, 0) + coalesce(li.extraordinary_amount, 0) + coalesce(li.previous_balance, 0)
            - coalesce(ip.paid, 0)
          )), 0) as overdue_amount
        from runs r
        inner join countrify.iadmin_liquidation_items li on li.liquidation_run_id = r.id
        left join (
          select
            liquidation_item_id,
            coalesce(sum(amount), 0) as paid
          from countrify.iadmin_payments
          where liquidation_item_id is not null
            and is_void = false
          group by liquidation_item_id
        ) ip on ip.liquidation_item_id = li.id
        where r.status <> 'calculated'
          and not (r.period_year = $2 and r.period_month = $3)
        group by r.property_id
      ),
      current_run as (
        select distinct on (r.property_id)
          r.property_id,
          r.status as run_status_this_month,
          coalesce(r.ordinary_total, 0) + coalesce(r.extraordinary_total, 0) as current_month_liquidated,
          coalesce(rp.collected, 0) as current_month_collected
        from runs r
        left join run_payments rp on rp.run_id = r.id
        where r.period_year = $2
          and r.period_month = $3
        order by r.property_id, r.id desc
      )
      select
        p.id as property_id,
        coalesce(b.total_balance, 0)::text as total_balance,
        coalesce(er.pending_expenses, 0) as pending_expenses,
        coalesce(er.accounts_payable_total, 0)::text as accounts_payable_total,
        coalesce(ho.overdue_amount, 0)::text as overdue_amount,
        coalesce(cr.current_month_liquidated, 0)::text as current_month_liquidated,
        coalesce(cr.current_month_collected, 0)::text as current_month_collected,
        case
          when coalesce(cr.current_month_liquidated, 0) > 0
            then round((coalesce(cr.current_month_collected, 0) / cr.current_month_liquidated) * 100)
          else null
        end::int as collection_rate_pct,
        coalesce(cp.has_open_period, false) as has_open_period,
        cr.run_status_this_month
      from props p
      left join balances b on b.property_id = p.id
      left join expense_rollup er on er.property_id = p.id
      left join historical_item_overdue ho on ho.property_id = p.id
      left join current_run cr on cr.property_id = p.id
      left join current_periods cp on cp.property_id = p.id
      order by p.id
    `,
    [administrationId, currentYear, currentMonth],
  )

  return result.rows
}
