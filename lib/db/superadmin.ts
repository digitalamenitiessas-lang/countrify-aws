import { pgQuery } from '@/lib/db/postgres'

export async function listAllPromotionsForSuperadminFromPostgres(): Promise<
  Array<{
    id: string
    business_id: string
    title: string
    description: string
    discount: string
    category: string | null
    expiration_date: string | null
    building_id: string | null
    image_path: string | null
    is_active: boolean
    created_at: string
    published_month: string | null
    source_promotion_id: string | null
    business_name: string | null
    redemption_count: number
  }>
> {
  const result = await pgQuery<{
    id: string
    business_id: string
    title: string
    description: string
    discount: string
    category: string | null
    expiration_date: string | null
    building_id: string | null
    image_path: string | null
    is_active: boolean
    created_at: string
    published_month: string | null
    source_promotion_id: string | null
    business_name: string | null
    redemption_count: number
  }>(
    `
      select
        p.id, p.business_id, p.title, p.description, p.discount, p.category,
        p.expiration_date::text as expiration_date, p.building_id,
        p.image_path, p.is_active, p.created_at::text as created_at,
        p.published_month::text as published_month,
        p.source_promotion_id,
        b.name as business_name,
        coalesce((select count(*)::int from countrify.promotion_redemptions r where r.promotion_id = p.id), 0) as redemption_count
      from public.promotions p
      left join public.businesses b on b.id = p.business_id
      order by p.created_at desc
    `,
  )
  return result.rows
}

export async function listAllRedemptionsByBuildingFromPostgres(): Promise<
  Array<{
    promotion_id: string
    building_id: string | null
    building_name: string | null
  }>
> {
  const result = await pgQuery<{
    promotion_id: string
    building_id: string | null
    building_name: string | null
  }>(
    `
      select r.promotion_id, p.building_id, b.name as building_name
      from countrify.promotion_redemptions r
      left join countrify.profiles p on p.id = r.profile_id
      left join countrify.buildings b on b.id = p.building_id
    `,
  )
  return result.rows
}

export async function countVecinoProfilesFromPostgres(): Promise<number> {
  const result = await pgQuery<{ c: number }>(
    `select count(*)::int as c from countrify.profiles where role = 'vecino'`,
  )
  return result.rows[0]?.c ?? 0
}

export async function listRedemptionsForBusinessFromPostgres(businessId: string): Promise<
  Array<{
    id: string
    profile_id: string
    promotion_id: string
    status: string
    redeemed_at: string | null
    created_at: string | null
    profile_full_name: string | null
    profile_floor: string | null
    profile_unit: string | null
    profile_building_id: string | null
    profile_building_name: string | null
    promotion_title: string | null
    promotion_discount: string | null
  }>
> {
  const result = await pgQuery<{
    id: string
    profile_id: string
    promotion_id: string
    status: string
    redeemed_at: string | null
    created_at: string | null
    profile_full_name: string | null
    profile_floor: string | null
    profile_unit: string | null
    profile_building_id: string | null
    profile_building_name: string | null
    promotion_title: string | null
    promotion_discount: string | null
  }>(
    `
      select
        r.id, r.profile_id, r.promotion_id, r.status::text as status,
        r.redeemed_at::text as redeemed_at, r.created_at::text as created_at,
        p.full_name as profile_full_name, p.floor as profile_floor, p.unit as profile_unit,
        b.id as profile_building_id, b.name as profile_building_name,
        pr.title as promotion_title, pr.discount as promotion_discount
      from countrify.promotion_redemptions r
      inner join public.promotions pr on pr.id = r.promotion_id
      left join countrify.profiles p on p.id = r.profile_id
      left join countrify.buildings b on b.id = p.building_id
      where pr.business_id = $1
      order by r.redeemed_at desc nulls last, r.created_at desc nulls last
    `,
    [businessId],
  )
  return result.rows
}

export async function listAllProfilesFromPostgres(): Promise<any[]> {
  const result = await pgQuery(`select * from countrify.profiles order by full_name asc nulls last`)
  return result.rows
}

export async function listAllBuildingsFromPostgres(): Promise<any[]> {
  const result = await pgQuery(`select * from countrify.buildings order by name asc`)
  return result.rows
}

export async function listAllBusinessesFromPostgres(): Promise<any[]> {
  const result = await pgQuery(`select * from public.businesses order by name asc`)
  return result.rows
}

export async function listBuildingAdminAssignmentsFromPostgres(): Promise<any[]> {
  const result = await pgQuery(
    `
      select
        baa.id,
        baa.profile_id,
        baa.building_id,
        baa.is_primary,
        baa.created_at,
        json_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'email', p.email,
          'phone', p.phone
        ) as profiles
      from countrify.building_admin_assignments baa
      inner join countrify.profiles p on p.id = baa.profile_id
    `,
  )
  return result.rows
}

export async function listSuperadminManagedPropertiesFromPostgres(): Promise<any[]> {
  const result = await pgQuery(
    `
      select
        mp.*,
        json_build_object(
          'id', b.id,
          'name', b.name,
          'address', b.address,
          'total_units', b.total_units
        ) as buildings,
        case when a.id is not null then json_build_object(
          'id', a.id,
          'name', a.name,
          'legal_name', a.legal_name,
          'tax_id', a.tax_id,
          'contact_email', a.contact_email,
          'contact_phone', a.contact_phone,
          'is_active', a.is_active,
          'legal_info', a.legal_info,
          'created_at', a.created_at
        ) else null end as iadmin_administrations
      from countrify.iadmin_managed_properties mp
      inner join countrify.buildings b on b.id = mp.building_id
      left join countrify.iadmin_administrations a on a.id = mp.administration_id
      order by mp.created_at desc
    `,
  )
  return result.rows
}

export async function getAdministrationIdByBuildingFromPostgres(
  buildingId: string,
): Promise<string | null> {
  const result = await pgQuery<{ administration_id: string }>(
    `
      select administration_id
      from countrify.iadmin_managed_properties
      where building_id = $1
      limit 1
    `,
    [buildingId],
  )
  return result.rows[0]?.administration_id ?? null
}

export async function assignBuildingAdminInPostgres(
  profileId: string,
  buildingId: string,
): Promise<{ isPrimary: boolean }> {
  const existing = await pgQuery<{ c: number }>(
    `select count(*)::int as c from countrify.building_admin_assignments where profile_id = $1`,
    [profileId],
  )
  const isPrimary = (existing.rows[0]?.c ?? 0) === 0

  await pgQuery(
    `
      insert into countrify.building_admin_assignments (profile_id, building_id, is_primary)
      values ($1, $2, $3)
      on conflict (profile_id, building_id) do update set is_primary = excluded.is_primary
    `,
    [profileId, buildingId, isPrimary],
  )

  if (isPrimary) {
    await pgQuery(
      `update countrify.profiles set building_id = $1 where id = $2`,
      [buildingId, profileId],
    )
  }

  return { isPrimary }
}

export async function assignIAdminRoleGrantInPostgres(
  profileId: string,
  administrationId: string,
  operationalRole: string,
): Promise<void> {
  const existing = await pgQuery<{ c: number }>(
    `select count(*)::int as c from countrify.iadmin_role_grants where profile_id = $1`,
    [profileId],
  )
  const isPrimary = (existing.rows[0]?.c ?? 0) === 0

  await pgQuery(
    `
      insert into countrify.iadmin_role_grants (administration_id, profile_id, operational_role, is_primary)
      values ($1, $2, $3, $4)
      on conflict (administration_id, profile_id) do update set
        operational_role = excluded.operational_role,
        is_primary = excluded.is_primary
    `,
    [administrationId, profileId, operationalRole, isPrimary],
  )
}

export async function createBusinessInPostgres(input: {
  name: string
  category: string
  description: string
  address: string | null
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into public.businesses (name, category, description, address)
      values ($1, $2, $3, $4)
      returning id
    `,
    [input.name, input.category, input.description, input.address],
  )
  return { id: result.rows[0].id }
}

export async function callSuperadminCreateConsorcioInPostgres(input: {
  buildingName: string
  buildingAddress: string
  buildingTotalUnits: number
  buildingLatitude: number | null
  buildingLongitude: number | null
  administrationName: string
  administrationLegalName: string | null
  administrationTaxId: string | null
  administrationContactEmail: string | null
  administrationContactPhone: string | null
  propertyDisplayName: string | null
  propertyKind: string
  propertyTaxId: string | null
  propertyManagedSince: string | null
  propertyManagementFeePct: number | null
  propertyNotes: string | null
  adminProfileId: string
  creatorProfileId: string
}): Promise<{ building_id: string; administration_id: string; managed_property_id: string }> {
  const result = await pgQuery<{ result: { building_id: string; administration_id: string; managed_property_id: string } }>(
    `
      select countrify.superadmin_create_consorcio(
        building_name := $1,
        building_address := $2,
        building_total_units := $3,
        building_latitude := $4,
        building_longitude := $5,
        administration_name := $6,
        administration_legal_name := $7,
        administration_tax_id := $8,
        administration_contact_email := $9,
        administration_contact_phone := $10,
        property_display_name := $11,
        property_kind := $12::countrify.iadmin_property_kind,
        property_tax_id := $13,
        property_managed_since := $14::date,
        property_management_fee_pct := $15,
        property_notes := $16,
        admin_profile_id := $17,
        creator_profile_id := $18
      ) as result
    `,
    [
      input.buildingName,
      input.buildingAddress,
      input.buildingTotalUnits,
      input.buildingLatitude,
      input.buildingLongitude,
      input.administrationName,
      input.administrationLegalName,
      input.administrationTaxId,
      input.administrationContactEmail,
      input.administrationContactPhone,
      input.propertyDisplayName,
      input.propertyKind,
      input.propertyTaxId,
      input.propertyManagedSince,
      input.propertyManagementFeePct,
      input.propertyNotes,
      input.adminProfileId,
      input.creatorProfileId,
    ],
  )

  return result.rows[0].result
}

export async function getBuildingByIdFromPostgres(
  buildingId: string,
): Promise<{ id: string; name: string } | null> {
  const result = await pgQuery<{ id: string; name: string }>(
    `select id, name from countrify.buildings where id = $1 limit 1`,
    [buildingId],
  )
  return result.rows[0] ?? null
}

export async function getManagedPropertyIdByBuildingFromPostgres(
  buildingId: string,
): Promise<string | null> {
  const result = await pgQuery<{ id: string }>(
    `select id from countrify.iadmin_managed_properties where building_id = $1 limit 1`,
    [buildingId],
  )
  return result.rows[0]?.id ?? null
}

export async function listUnitsForOccupancyFromPostgres(
  propertyId: string,
): Promise<Array<{ id: string; code: string; floor: string | null; kind: string }>> {
  const result = await pgQuery<{ id: string; code: string; floor: string | null; kind: string }>(
    `select id, code, floor, kind::text as kind from countrify.iadmin_units where managed_property_id = $1`,
    [propertyId],
  )
  return result.rows
}

export async function findUnitByPropertyAndCodeIlikeFromPostgres(input: {
  managedPropertyId: string
  code: string
}): Promise<{ id: string } | null> {
  const result = await pgQuery<{ id: string }>(
    `select id from countrify.iadmin_units where managed_property_id = $1 and code ilike $2 limit 1`,
    [input.managedPropertyId, input.code],
  )
  return result.rows[0] ?? null
}

export async function setBusinessOwnerInPostgres(
  businessId: string,
  ownerProfileId: string,
): Promise<void> {
  await pgQuery(
    `update public.businesses set owner_profile_id = $1 where id = $2`,
    [ownerProfileId, businessId],
  )
}
