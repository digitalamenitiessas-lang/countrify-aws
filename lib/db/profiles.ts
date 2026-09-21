import type { Profile, UserRole } from '@/lib/types'
import { pgQuery } from '@/lib/db/postgres'

function mapProfileRow(row: any): Profile {
  return {
    id: row.id,
    email: row.email ?? '',
    fullName: row.full_name ?? 'Usuario',
    role: row.role as UserRole,
    avatarText: row.avatar_text ?? (row.full_name?.slice(0, 2)?.toUpperCase() || 'U'),
    businessId: row.business_id ?? null,
    buildingId: row.building_id ?? null,
    floor: row.floor ?? null,
    unit: row.unit ?? null,
    phone: row.phone ?? null,
    passwordMustChange: row.password_must_change ?? false,
    createdAt: row.created_at,
  }
}

export async function findProfileByEmail(email: string) {
  const result = await pgQuery(
    `
      select *
      from countrify.profiles
      where lower(email) = lower($1)
      limit 1
    `,
    [email],
  )

  if (!result.rows[0]) {
    return null
  }

  return mapProfileRow(result.rows[0])
}

// ----------------------------------------------------------------------------
// Credenciales locales (antes vivian en el user pool de Cognito)
// ----------------------------------------------------------------------------

export type ProfileCredentials = { profile: Profile; passwordHash: string | null }

// Devuelve el profile junto con su hash. Separado de findProfileByEmail para
// que el hash no viaje en los objetos Profile que se serializan al cliente.
export async function findProfileCredentialsByEmail(
  email: string,
): Promise<ProfileCredentials | null> {
  const result = await pgQuery(
    `
      select *
      from countrify.profiles
      where lower(email) = lower($1)
      limit 1
    `,
    [email],
  )

  const row = result.rows[0]
  if (!row) {
    return null
  }

  return { profile: mapProfileRow(row), passwordHash: row.password_hash ?? null }
}

export async function findProfileCredentialsById(
  profileId: string,
): Promise<ProfileCredentials | null> {
  const result = await pgQuery(
    `
      select *
      from countrify.profiles
      where id = $1
      limit 1
    `,
    [profileId],
  )

  const row = result.rows[0]
  if (!row) {
    return null
  }

  return { profile: mapProfileRow(row), passwordHash: row.password_hash ?? null }
}

// Escribe el hash argon2 de la contraseña. Lo usan el reset por token, el
// cambio in-session y el alta de usuarios con contraseña temporal.
export async function setProfilePasswordHash(
  profileId: string,
  passwordHash: string,
): Promise<void> {
  await pgQuery(
    `update countrify.profiles set password_hash = $2 where id = $1`,
    [profileId, passwordHash],
  )
}

export async function upsertProfile(input: {
  id: string
  email: string
  fullName: string
  avatarText: string
  role: UserRole
  phone: string | null
  buildingId: string | null
  businessId: string | null
  passwordMustChangeOnCreate?: boolean
  // Solo se honra en el INSERT: reutilizar un perfil existente nunca le pisa
  // la contraseña.
  passwordHashOnCreate?: string | null
}): Promise<Profile> {
  const result = await pgQuery(
    `
      insert into countrify.profiles (id, email, full_name, avatar_text, role, phone, building_id, business_id, password_must_change, password_hash)
      values ($1, lower($2), $3, $4, $5, $6, $7, $8, coalesce($9, false), $10)
      on conflict (id) do update set
        email = excluded.email,
        full_name = excluded.full_name,
        avatar_text = excluded.avatar_text,
        role = excluded.role,
        phone = excluded.phone,
        building_id = excluded.building_id,
        business_id = excluded.business_id
      returning *
    `,
    [
      input.id,
      input.email,
      input.fullName,
      input.avatarText,
      input.role,
      input.phone,
      input.buildingId,
      input.businessId,
      input.passwordMustChangeOnCreate ?? null,
      input.passwordHashOnCreate ?? null,
    ],
  )

  return mapProfileRow(result.rows[0])
}

export async function clearPasswordMustChange(profileId: string): Promise<void> {
  await pgQuery(
    `update countrify.profiles set password_must_change = false where id = $1`,
    [profileId],
  )
}

export async function markPasswordMustChange(profileId: string): Promise<void> {
  await pgQuery(
    `update countrify.profiles set password_must_change = true where id = $1`,
    [profileId],
  )
}

// El parametro `source` es un resto de cuando los negocios vivian en el schema
// de Citify: hoy todos los profiles estan en countrify.profiles. Se sigue
// aceptando (opcional) para no romper los call sites viejos, pero no cambia
// nada.
export async function getEmailNotificationsPrefs(
  profileId: string,
  _source?: 'primary' | 'business',
): Promise<Record<string, boolean>> {
  const res = await pgQuery<{ email_notifications: Record<string, boolean> }>(
    `select email_notifications from countrify.profiles where id = $1 limit 1`,
    [profileId],
  )
  return res.rows[0]?.email_notifications ?? {}
}

export async function setEmailNotificationsPrefs(
  profileId: string,
  _source: 'primary' | 'business' | undefined,
  prefs: Record<string, boolean>,
): Promise<void> {
  await pgQuery(
    `update countrify.profiles set email_notifications = $2::jsonb where id = $1`,
    [profileId, JSON.stringify(prefs)],
  )
}

export async function findProfileById(id: string) {
  const result = await pgQuery(
    `
      select *
      from countrify.profiles
      where id = $1
      limit 1
    `,
    [id],
  )

  if (!result.rows[0]) {
    return null
  }

  return mapProfileRow(result.rows[0])
}

// ----------------------------------------------------------------------------
// Vista de negocios. Viven en la misma tabla countrify.profiles que el resto;
// lo unico que los distingue es role = 'negocio_admin' + business_id. Estos
// helpers son ese filtro, no otro origen de datos.
// ----------------------------------------------------------------------------

const BUSINESS_PROFILE_SELECT = `
  select id, email, full_name, role, avatar_text, business_id,
         null::uuid as building_id, null::text as floor, null::text as unit,
         phone, password_must_change, created_at
  from countrify.profiles
  where role = 'negocio_admin'
    and business_id is not null
`

// Upserta un profile de negocio. countrify.businesses.owner_profile_id apunta a
// countrify.profiles(id), asi que el row vive ahi como cualquier otro.
export async function upsertBusinessProfile(input: {
  id: string
  email: string
  fullName: string
  avatarText: string
  phone: string | null
  businessId: string | null
  passwordMustChangeOnCreate?: boolean
  passwordHashOnCreate?: string | null
}): Promise<Profile> {
  const result = await pgQuery(
    `
      insert into countrify.profiles (id, email, full_name, avatar_text, role, phone, business_id, password_must_change, password_hash)
      values ($1, lower($2), $3, $4, 'negocio_admin', $5, $6, coalesce($7, false), $8)
      on conflict (id) do update set
        email = excluded.email,
        full_name = excluded.full_name,
        avatar_text = excluded.avatar_text,
        -- role tiene que ir aca igual que en upsertProfile: al sacar el
        -- dual-pool, esta funcion puede caer sobre un profile que ya existia
        -- con otro rol. Sin esta linea el alta de negocio "funciona" pero el
        -- usuario queda con el rol viejo y no entra al panel del negocio.
        role = excluded.role,
        phone = excluded.phone,
        business_id = excluded.business_id
      returning *
    `,
    [
      input.id,
      input.email,
      input.fullName,
      input.avatarText,
      input.phone,
      input.businessId,
      input.passwordMustChangeOnCreate ?? null,
      input.passwordHashOnCreate ?? null,
    ],
  )
  return mapProfileRow(result.rows[0])
}

export async function findBusinessProfileByEmail(email: string) {
  const result = await pgQuery(
    `${BUSINESS_PROFILE_SELECT} and lower(email) = lower($1) limit 1`,
    [email],
  )
  if (!result.rows[0]) return null
  return mapProfileRow(result.rows[0])
}

export async function findBusinessProfileById(id: string) {
  const result = await pgQuery(
    `${BUSINESS_PROFILE_SELECT} and id = $1 limit 1`,
    [id],
  )
  if (!result.rows[0]) return null
  return mapProfileRow(result.rows[0])
}
