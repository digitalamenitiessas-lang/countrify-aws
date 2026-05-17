import { pgQuery } from '@/lib/db/postgres'

// ----------------------------------------------------------------------------
// Push subscriptions (no es de business strictly pero comparte patron)
// ----------------------------------------------------------------------------

export async function upsertPushSubscriptionInPostgres(input: {
  profileId: string
  endpoint: string
  p256dh: string
  auth: string
}): Promise<void> {
  await pgQuery(
    `
      insert into countrify.push_subscriptions (profile_id, endpoint, p256dh, auth)
      values ($1, $2, $3, $4)
      on conflict (profile_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth
    `,
    [input.profileId, input.endpoint, input.p256dh, input.auth],
  )
}

export async function listPushSubscriptionsForProfileFromPostgres(
  profileId: string,
): Promise<Array<{ endpoint: string; p256dh: string; auth: string }>> {
  const result = await pgQuery<{ endpoint: string; p256dh: string; auth: string }>(
    `select endpoint, p256dh, auth from countrify.push_subscriptions where profile_id = $1`,
    [profileId],
  )
  return result.rows
}

export async function updateBusinessFieldsInPostgres(
  businessId: string,
  patch: Partial<{
    logo_path: string | null
    address: string
    latitude: number
    longitude: number
  }>,
): Promise<void> {
  const cols: string[] = []
  const values: unknown[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    values.push(value)
    cols.push(`${key} = $${values.length}`)
  }
  if (cols.length === 0) return
  values.push(businessId)
  await pgQuery(
    `update public.businesses set ${cols.join(', ')} where id = $${values.length}`,
    values,
  )
}

export async function upsertPromotionInPostgres(input: {
  id: string
  businessId: string
  title: string
  description: string
  discount: string
  category: string
  expirationDate: string
  buildingId: string | null
  imagePath: string | null
  mode: 'create' | 'update'
}): Promise<void> {
  if (input.mode === 'update') {
    await pgQuery(
      `
        update public.promotions
        set title = $1,
            description = $2,
            discount = $3,
            category = $4,
            expiration_date = $5::date,
            building_id = $6,
            image_path = $7,
            is_active = true
        where id = $8 and business_id = $9
      `,
      [
        input.title,
        input.description,
        input.discount,
        input.category,
        input.expirationDate,
        input.buildingId,
        input.imagePath,
        input.id,
        input.businessId,
      ],
    )
    return
  }
  await pgQuery(
    `
      insert into public.promotions (
        id, business_id, title, description, discount, category,
        expiration_date, building_id, image_path, is_active
      )
      values ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, true)
    `,
    [
      input.id,
      input.businessId,
      input.title,
      input.description,
      input.discount,
      input.category,
      input.expirationDate,
      input.buildingId,
      input.imagePath,
    ],
  )
}

export async function deletePromotionInPostgres(input: {
  promotionId: string
  businessId: string
}): Promise<void> {
  await pgQuery(`delete from public.promotions where id = $1 and business_id = $2`, [
    input.promotionId,
    input.businessId,
  ])
}

// ----------------------------------------------------------------------------
// Saved promotions / marketplace
// ----------------------------------------------------------------------------

export async function isSavedPromotionInPostgres(input: {
  profileId: string
  promotionId: string
}): Promise<boolean> {
  const result = await pgQuery(
    `select 1 from countrify.saved_promotions where profile_id = $1 and promotion_id = $2 limit 1`,
    [input.profileId, input.promotionId],
  )
  return result.rows.length > 0
}

export async function toggleSavedPromotionInPostgres(input: {
  profileId: string
  promotionId: string
}): Promise<{ saved: boolean }> {
  const exists = await isSavedPromotionInPostgres(input)
  if (exists) {
    await pgQuery(
      `delete from countrify.saved_promotions where profile_id = $1 and promotion_id = $2`,
      [input.profileId, input.promotionId],
    )
    return { saved: false }
  }
  await pgQuery(
    `insert into countrify.saved_promotions (profile_id, promotion_id) values ($1, $2) on conflict do nothing`,
    [input.profileId, input.promotionId],
  )
  return { saved: true }
}

export async function insertMarketplaceItemInPostgres(input: {
  id: string
  sellerProfileId: string
  buildingId: string
  title: string
  price: number
  description: string
  condition: string
  imagePath: string | null
}): Promise<void> {
  await pgQuery(
    `
      insert into countrify.marketplace_items (
        id, seller_profile_id, building_id, title, price, description, condition, image_path, is_active
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, true)
    `,
    [
      input.id,
      input.sellerProfileId,
      input.buildingId,
      input.title,
      input.price,
      input.description,
      input.condition,
      input.imagePath,
    ],
  )
}

// ----------------------------------------------------------------------------
// Promotion redemption tokens (replicates the prior auth.uid()-based RPCs
// in TypeScript so the flow keeps working on RDS without Supabase auth)
// ----------------------------------------------------------------------------

export async function getPromotionForRedemptionFromPostgres(promotionId: string): Promise<{
  id: string
  business_id: string
  title: string
  is_active: boolean
  expiration_date: string | null
  building_id: string | null
} | null> {
  const result = await pgQuery<{
    id: string
    business_id: string
    title: string
    is_active: boolean
    expiration_date: string | null
    building_id: string | null
  }>(
    `select id, business_id, title, is_active, expiration_date::text as expiration_date, building_id from public.promotions where id = $1 limit 1`,
    [promotionId],
  )
  return result.rows[0] ?? null
}

export async function getBusinessNameFromPostgres(businessId: string): Promise<string | null> {
  const result = await pgQuery<{ name: string }>(
    `select name from public.businesses where id = $1 limit 1`,
    [businessId],
  )
  return result.rows[0]?.name ?? null
}

export async function existsRedemptionForProfilePromotionFromPostgres(input: {
  profileId: string
  promotionId: string
}): Promise<boolean> {
  const result = await pgQuery(
    `select 1 from countrify.promotion_redemptions where profile_id = $1 and promotion_id = $2 limit 1`,
    [input.profileId, input.promotionId],
  )
  return result.rows.length > 0
}

export async function getOrCreateRedemptionTokenInPostgres(input: {
  profileId: string
  promotionId: string
  expiresAt: string
}): Promise<{ id: string; token: string; expires_at: string }> {
  // Expirar pendings vencidos
  await pgQuery(
    `update countrify.promotion_redemption_tokens set status = 'expired' where profile_id = $1 and promotion_id = $2 and status = 'pending' and expires_at <= now()`,
    [input.profileId, input.promotionId],
  )

  // Buscar pending vivo
  const existing = await pgQuery<{ id: string; token: string; expires_at: string }>(
    `select id, token, expires_at::text as expires_at from countrify.promotion_redemption_tokens where profile_id = $1 and promotion_id = $2 and status = 'pending' and expires_at > now() order by created_at desc limit 1`,
    [input.profileId, input.promotionId],
  )
  if (existing.rows[0]) return existing.rows[0]

  const created = await pgQuery<{ id: string; token: string; expires_at: string }>(
    `
      insert into countrify.promotion_redemption_tokens (promotion_id, profile_id, token, expires_at)
      values ($1, $2, countrify.generate_promotion_redemption_token(), $3::timestamptz)
      returning id, token, expires_at::text as expires_at
    `,
    [input.promotionId, input.profileId, input.expiresAt],
  )
  return created.rows[0]
}

export async function getLatestRedemptionForProfilePromotionFromPostgres(input: {
  profileId: string
  promotionId: string
}): Promise<{ id: string; redeemed_at: string | null; created_at: string | null } | null> {
  const result = await pgQuery<{ id: string; redeemed_at: string | null; created_at: string | null }>(
    `
      select id, redeemed_at::text as redeemed_at, created_at::text as created_at
      from countrify.promotion_redemptions
      where profile_id = $1 and promotion_id = $2 and status = 'redeemed'
      order by redeemed_at desc nulls last, created_at desc nulls last
      limit 1
    `,
    [input.profileId, input.promotionId],
  )
  return result.rows[0] ?? null
}

export async function findRedemptionTokenByCodeFromPostgres(token: string): Promise<{
  id: string
  promotion_id: string
  profile_id: string
  status: string
  expires_at: string
  redeemed_at: string | null
} | null> {
  const result = await pgQuery<{
    id: string
    promotion_id: string
    profile_id: string
    status: string
    expires_at: string
    redeemed_at: string | null
  }>(
    `select id, promotion_id, profile_id, status, expires_at::text as expires_at, redeemed_at::text as redeemed_at from countrify.promotion_redemption_tokens where token = $1 limit 1`,
    [token],
  )
  return result.rows[0] ?? null
}

export async function getProfileFullNameFromPostgres(profileId: string): Promise<string | null> {
  const result = await pgQuery<{ full_name: string | null }>(
    `select full_name from countrify.profiles where id = $1 limit 1`,
    [profileId],
  )
  return result.rows[0]?.full_name ?? null
}

export async function markTokenRedeemedInPostgres(input: {
  tokenId: string
  redeemedByBusinessId: string | null
}): Promise<void> {
  await pgQuery(
    `
      update countrify.promotion_redemption_tokens
      set status = 'redeemed',
          redeemed_at = coalesce(redeemed_at, now()),
          redeemed_by_business_id = coalesce(redeemed_by_business_id, $1)
      where id = $2
    `,
    [input.redeemedByBusinessId, input.tokenId],
  )
}

export async function insertPromotionRedemptionInPostgres(input: {
  profileId: string
  promotionId: string
}): Promise<{ id: string | null }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into countrify.promotion_redemptions (profile_id, promotion_id, status, redeemed_at)
      values ($1, $2, 'redeemed', now())
      on conflict (profile_id, promotion_id) do nothing
      returning id
    `,
    [input.profileId, input.promotionId],
  )
  return { id: result.rows[0]?.id ?? null }
}
