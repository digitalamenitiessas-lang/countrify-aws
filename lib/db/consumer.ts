import { pgQuery, pgQueryAsProfile } from '@/lib/db/postgres'

// ----------------------------------------------------------------------------
// Membership con units + property + building (lo que necesita el dashboard
// del vecino para mostrar "tu unidad")
// ----------------------------------------------------------------------------

export type MembershipFullRow = {
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
  unit_code: string | null
  unit_floor: string | null
  building_name: string | null
}

export async function listFullMembershipsForProfileFromPostgres(
  profileId: string,
): Promise<MembershipFullRow[]> {
  const result = await pgQuery<MembershipFullRow>(
    `
      select
        m.id, m.unit_id, m.building_id, m.profile_id,
        m.relationship_type::text as relationship_type,
        m.is_primary, m.active, m.created_at::text as created_at,
        m.created_by_profile_id,
        p.email as profile_email, p.full_name as profile_full_name,
        p.role::text as profile_role, p.floor as profile_floor, p.unit as profile_unit,
        u.code as unit_code, u.floor as unit_floor,
        b.name as building_name
      from countrify.unit_profile_memberships m
      left join countrify.profiles p on p.id = m.profile_id
      left join countrify.iadmin_units u on u.id = m.unit_id
      left join countrify.iadmin_managed_properties mp on mp.id = u.managed_property_id
      left join countrify.buildings b on b.id = mp.building_id
      where m.profile_id = $1 and m.active = true
      order by m.created_at asc
    `,
    [profileId],
  )
  return result.rows
}

export async function listHouseholdMembershipsForUnitFromPostgres(
  unitId: string,
): Promise<MembershipFullRow[]> {
  const result = await pgQuery<MembershipFullRow>(
    `
      select
        m.id, m.unit_id, m.building_id, m.profile_id,
        m.relationship_type::text as relationship_type,
        m.is_primary, m.active, m.created_at::text as created_at,
        m.created_by_profile_id,
        p.email as profile_email, p.full_name as profile_full_name,
        p.role::text as profile_role, p.floor as profile_floor, p.unit as profile_unit,
        u.code as unit_code, u.floor as unit_floor,
        b.name as building_name
      from countrify.unit_profile_memberships m
      left join countrify.profiles p on p.id = m.profile_id
      left join countrify.iadmin_units u on u.id = m.unit_id
      left join countrify.iadmin_managed_properties mp on mp.id = u.managed_property_id
      left join countrify.buildings b on b.id = mp.building_id
      where m.unit_id = $1 and m.active = true
      order by m.relationship_type asc, m.created_at asc
    `,
    [unitId],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Building completo (con lat/lng/total_units)
// ----------------------------------------------------------------------------

export type BuildingFullRow = {
  id: string
  name: string
  address: string | null
  total_units: number | null
  latitude: string | null
  longitude: string | null
  created_at: string
}

export async function getBuildingFullByIdFromPostgres(
  buildingId: string,
): Promise<BuildingFullRow | null> {
  const result = await pgQuery<BuildingFullRow>(
    `
      select id, name, address, total_units,
             latitude::text as latitude, longitude::text as longitude,
             created_at::text as created_at
      from countrify.buildings
      where id = $1
      limit 1
    `,
    [buildingId],
  )
  return result.rows[0] ?? null
}

// ----------------------------------------------------------------------------
// Marketplace items con seller profile
// ----------------------------------------------------------------------------

export type MarketplaceItemRow = {
  id: string
  building_id: string
  seller_profile_id: string
  title: string
  price: string
  description: string
  condition: string
  image_path: string | null
  is_active: boolean
  created_at: string
  seller_full_name: string | null
  seller_avatar_text: string | null
  seller_phone: string | null
}

export async function listMarketplaceItemsForBuildingFromPostgres(
  buildingId: string,
): Promise<MarketplaceItemRow[]> {
  const result = await pgQuery<MarketplaceItemRow>(
    `
      select m.id, m.building_id, m.seller_profile_id, m.title,
             m.price::text as price, m.description, m.condition,
             m.image_path, m.is_active, m.created_at::text as created_at,
             p.full_name as seller_full_name,
             p.avatar_text as seller_avatar_text,
             p.phone as seller_phone
      from countrify.marketplace_items m
      left join countrify.profiles p on p.id = m.seller_profile_id
      where m.building_id = $1 and m.is_active = true
      order by m.created_at desc
    `,
    [buildingId],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Saved / used promotions (solo ids)
// ----------------------------------------------------------------------------

export async function listSavedPromotionIdsForProfileFromPostgres(
  profileId: string,
): Promise<string[]> {
  const result = await pgQuery<{ promotion_id: string }>(
    `select promotion_id from countrify.saved_promotions where profile_id = $1`,
    [profileId],
  )
  return result.rows.map((r: { promotion_id: string }) => r.promotion_id)
}

export async function listUsedPromotionIdsForProfileFromPostgres(
  profileId: string,
): Promise<string[]> {
  const result = await pgQuery<{ promotion_id: string }>(
    `select promotion_id from countrify.promotion_redemptions where profile_id = $1`,
    [profileId],
  )
  return result.rows.map((r: { promotion_id: string }) => r.promotion_id)
}

// ----------------------------------------------------------------------------
// Complaint reasons (catalog público)
// ----------------------------------------------------------------------------

export type ComplaintReasonRow = {
  id: string
  slug: string
  label: string
  is_other: boolean
}

export async function listComplaintReasonsFromPostgres(): Promise<ComplaintReasonRow[]> {
  const result = await pgQuery<ComplaintReasonRow>(
    `select id, slug, label, is_other from countrify.complaint_reason_catalog order by label asc`,
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Mentionable users del edificio (vecinos + admins)
// ----------------------------------------------------------------------------

export type MentionableUserRow = {
  id: string
  full_name: string | null
  role: string | null
  floor: string | null
  unit: string | null
  building_id: string
}

export async function listMentionablesForBuildingFromPostgres(
  buildingId: string,
): Promise<MentionableUserRow[]> {
  const result = await pgQuery<MentionableUserRow>(
    `
      (select p.id, p.full_name, p.role::text as role, p.floor, p.unit, $1::uuid as building_id
       from countrify.profiles p
       where p.role = 'vecino' and p.building_id = $1)
      union
      (select p.id, p.full_name, p.role::text as role, p.floor, p.unit, a.building_id
       from countrify.building_admin_assignments a
       inner join countrify.profiles p on p.id = a.profile_id
       where a.building_id = $1)
      order by full_name asc nulls last
    `,
    [buildingId],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Complaint cases del vecino (via RPC con auth.uid() resuelto por
// pgQueryAsProfile)
// ----------------------------------------------------------------------------

export async function listNeighborComplaintCasesFromPostgres(input: {
  profileId: string
  buildingId: string
}): Promise<any[]> {
  const result = await pgQueryAsProfile<any>(
    input.profileId,
    `select * from countrify.get_neighbor_complaint_cases($1::uuid)`,
    [input.buildingId],
  )
  return result.rows
}

// ----------------------------------------------------------------------------
// Building information visible para el rol del vecino
// ----------------------------------------------------------------------------

export type BuildingInformationRow = {
  id: string
  building_id: string
  title: string
  category: string
  content: string
  visible_to: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  created_by_profile_id: string | null
  updated_by_profile_id: string | null
}

export async function listBuildingInformationForBuildingFromPostgres(input: {
  buildingId: string
  visibleTo: string[]
}): Promise<BuildingInformationRow[]> {
  const result = await pgQuery<BuildingInformationRow>(
    `
      select id, building_id, title, category, content,
             visible_to::text as visible_to, sort_order, is_active,
             created_at::text as created_at, updated_at::text as updated_at,
             created_by_profile_id, updated_by_profile_id
      from countrify.building_information
      where building_id = $1 and is_active = true and visible_to::text = any($2::text[])
      order by sort_order asc, created_at desc
    `,
    [input.buildingId, input.visibleTo],
  )
  return result.rows
}
