const { Pool } = require('pg')

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
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

  const [buildings, businesses, profiles] = await Promise.all([
    fetchSupabaseRows(
      supabaseUrl,
      supabaseServiceRoleKey,
      'buildings',
      'id,name,address,total_units,created_at',
      { order: 'created_at.asc' },
    ),
    fetchSupabaseRows(
      supabaseUrl,
      supabaseServiceRoleKey,
      'businesses',
      'id,name,category,description,owner_profile_id,logo_path,created_at,updated_at',
      { order: 'created_at.asc' },
    ),
    fetchSupabaseRows(
      supabaseUrl,
      supabaseServiceRoleKey,
      'profiles',
      'id,email,full_name,role,avatar_text,business_id,building_id,floor,unit,phone,created_at,updated_at',
      { order: 'created_at.asc' },
    ),
  ])

  const client = await pool.connect()

  try {
    await client.query('begin')

    for (const row of buildings || []) {
      await client.query(
        `
          insert into public.buildings (
            id,
            name,
            address,
            total_units,
            created_at
          )
          values ($1,$2,$3,$4,$5)
          on conflict (id) do update set
            name = excluded.name,
            address = excluded.address,
            total_units = excluded.total_units
        `,
        [row.id, row.name, row.address, row.total_units ?? 0, row.created_at],
      )
    }

    for (const row of profiles || []) {
      await client.query(
        `
          insert into auth.users (
            id,
            email,
            raw_user_meta_data,
            created_at
          )
          values ($1,$2,$3,$4)
          on conflict (id) do update set
            email = excluded.email,
            raw_user_meta_data = excluded.raw_user_meta_data
        `,
        [
          row.id,
          normalizeEmail(row.email),
          JSON.stringify({
            full_name: row.full_name ?? null,
            role: row.role ?? null,
          }),
          row.created_at,
        ],
      )
    }

    for (const row of profiles || []) {
      await client.query(
        `
          insert into public.profiles (
            id,
            email,
            full_name,
            role,
            avatar_text,
            building_id,
            business_id,
            floor,
            unit,
            phone,
            created_at,
            updated_at
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          on conflict (id) do update set
            email = excluded.email,
            full_name = excluded.full_name,
            role = excluded.role,
            avatar_text = excluded.avatar_text,
            building_id = excluded.building_id,
            floor = excluded.floor,
            unit = excluded.unit,
            phone = excluded.phone,
            updated_at = excluded.updated_at
        `,
        [
          row.id,
          normalizeEmail(row.email),
          row.full_name,
          row.role,
          row.avatar_text,
          row.building_id,
          null,
          row.floor,
          row.unit,
          row.phone,
          row.created_at,
          row.updated_at ?? row.created_at,
        ],
      )
    }

    for (const row of businesses || []) {
      await client.query(
        `
          insert into public.businesses (
            id,
            name,
            category,
            description,
            owner_profile_id,
            logo_path,
            created_at,
            updated_at
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8)
          on conflict (id) do update set
            name = excluded.name,
            category = excluded.category,
            description = excluded.description,
            owner_profile_id = excluded.owner_profile_id,
            logo_path = excluded.logo_path,
            updated_at = excluded.updated_at
        `,
        [
          row.id,
          row.name,
          row.category,
          row.description ?? '',
          row.owner_profile_id,
          row.logo_path,
          row.created_at,
          row.updated_at ?? row.created_at,
        ],
      )
    }

    for (const row of profiles || []) {
      if (!row.business_id) continue
      await client.query(
        `
          update public.profiles
          set business_id = $2,
              updated_at = $3
          where id = $1
        `,
        [row.id, row.business_id, row.updated_at ?? row.created_at],
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
          buildings: (buildings || []).length,
          businesses: (businesses || []).length,
          profiles: (profiles || []).length,
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
