const { Pool } = require('pg')

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

async function fetchSupabaseRows(baseUrl, serviceRoleKey, table, select, extraParams = {}) {
  const url = new URL(`/rest/v1/${table}`, baseUrl)
  url.searchParams.set('select', select)

  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to fetch ${table} from Supabase: ${response.status} ${body}`)
  }

  return response.json()
}

function dedupeBy(rows, getKey, pickRow) {
  const map = new Map()

  for (const row of rows || []) {
    const key = getKey(row)
    const current = map.get(key)
    map.set(key, current ? pickRow(current, row) : row)
  }

  return Array.from(map.values())
}

async function main() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const pool = new Pool({
    host: requireEnv('DB_HOST'),
    port: Number(process.env.DB_PORT || '5432'),
    database: requireEnv('DB_NAME'),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  })

  const [promotions, rawRedemptions, rawSavedPromotions] = await Promise.all([
    fetchSupabaseRows(
      supabaseUrl,
      supabaseServiceRoleKey,
      'promotions',
      'id,business_id,building_id,title,description,discount,category,expiration_date,image_path,is_active,created_at,updated_at',
      { order: 'created_at.asc' },
    ),
    fetchSupabaseRows(
      supabaseUrl,
      supabaseServiceRoleKey,
      'promotion_redemptions',
      'id,profile_id,promotion_id,status,redeemed_at,created_at',
      { order: 'created_at.asc' },
    ),
    fetchSupabaseRows(
      supabaseUrl,
      supabaseServiceRoleKey,
      'saved_promotions',
      'profile_id,promotion_id,created_at',
      { order: 'created_at.asc' },
    ),
  ])

  const redemptions = dedupeBy(
    rawRedemptions,
    (row) => `${row.profile_id}:${row.promotion_id}`,
    (current, next) => {
      const currentTime = new Date(current.redeemed_at ?? current.created_at ?? 0).getTime()
      const nextTime = new Date(next.redeemed_at ?? next.created_at ?? 0).getTime()
      return nextTime >= currentTime ? next : current
    },
  )

  const savedPromotions = dedupeBy(
    rawSavedPromotions,
    (row) => `${row.profile_id}:${row.promotion_id}`,
    (current, next) => {
      const currentTime = new Date(current.created_at ?? 0).getTime()
      const nextTime = new Date(next.created_at ?? 0).getTime()
      return nextTime >= currentTime ? next : current
    },
  )

  const client = await pool.connect()

  try {
    await client.query('begin')
    await client.query('delete from countrify.saved_promotions')
    await client.query('delete from countrify.promotion_redemptions')
    await client.query('delete from public.promotions')

    for (const row of promotions || []) {
      await client.query(
        `
          insert into public.promotions (
            id,
            business_id,
            building_id,
            title,
            description,
            discount,
            category,
            expiration_date,
            image_path,
            is_active,
            created_at,
            updated_at
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          on conflict (id) do update set
            business_id = excluded.business_id,
            building_id = excluded.building_id,
            title = excluded.title,
            description = excluded.description,
            discount = excluded.discount,
            category = excluded.category,
            expiration_date = excluded.expiration_date,
            image_path = excluded.image_path,
            is_active = excluded.is_active,
            updated_at = excluded.updated_at
        `,
        [
          row.id,
          row.business_id,
          row.building_id,
          row.title,
          row.description,
          row.discount,
          row.category,
          row.expiration_date,
          row.image_path,
          Boolean(row.is_active),
          row.created_at,
          row.updated_at ?? row.created_at,
        ],
      )
    }

    for (const row of redemptions || []) {
      await client.query(
        `
          insert into countrify.promotion_redemptions (
            id,
            profile_id,
            promotion_id,
            status,
            redeemed_at,
            created_at
          )
          values ($1,$2,$3,$4,$5,$6)
          on conflict (profile_id, promotion_id) do update set
            status = excluded.status,
            redeemed_at = excluded.redeemed_at,
            created_at = excluded.created_at
        `,
        [
          row.id,
          row.profile_id,
          row.promotion_id,
          row.status,
          row.redeemed_at,
          row.created_at,
        ],
      )
    }

    for (const row of savedPromotions || []) {
      await client.query(
        `
          insert into countrify.saved_promotions (
            profile_id,
            promotion_id,
            created_at
          )
          values ($1,$2,$3)
          on conflict (profile_id, promotion_id) do update set
            created_at = excluded.created_at
        `,
        [row.profile_id, row.promotion_id, row.created_at],
      )
    }

    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
    await pool.end()
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        synced: {
          promotions: (promotions || []).length,
          redemptions: (redemptions || []).length,
          savedPromotions: (savedPromotions || []).length,
        },
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
