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
}): Promise<Profile> {
  const result = await pgQuery(
    `
      insert into countrify.profiles (id, email, full_name, avatar_text, role, phone, building_id, business_id, password_must_change)
      values ($1, lower($2), $3, $4, $5, $6, $7, $8, coalesce($9, false))
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
    ],
  )

  return mapProfileRow(result.rows[0])
}

export async function clearPasswordMustChange(profileId: string): Promise<void> {
  await pgQuery(
    `update countrify.profiles set password_must_change = false where id = $1`,
    [profileId],
  )
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
  await pgQuery(
    `update countrify.profiles set password_must_change = true where id = $1`,
    [profileId],
  )
}

// Email notifications viven en ambos schemas (countrify.profiles para
// vecinos/admins, countrify.profiles para business). Estos helpers branchean
// segun donde este el profile.
export async function getEmailNotificationsPrefs(
  profileId: string,
  source: 'primary' | 'business',
): Promise<Record<string, boolean>> {
  const table = source === 'business' ? 'countrify.profiles' : 'countrify.profiles'
  const res = await pgQuery<{ email_notifications: Record<string, boolean> }>(
    `select email_notifications from ${table} where id = $1 limit 1`,
    [profileId],
  )
  return res.rows[0]?.email_notifications ?? {}
}

export async function setEmailNotificationsPrefs(
  profileId: string,
  source: 'primary' | 'business',
  prefs: Record<string, boolean>,
): Promise<void> {
  const table = source === 'business' ? 'countrify.profiles' : 'countrify.profiles'
  await pgQuery(
    `update ${table} set email_notifications = $2::jsonb where id = $1`,
    [profileId, JSON.stringify(prefs)],
  )
}

// Busca un profile por email en ambos schemas. countrify.profiles (vecinos/
// admins) tiene prioridad; si no aparece ahi, prueba countrify.profiles
// (negocios compartidos con Citify). Devuelve tambien el "source" para que
// el caller sepa contra que pool de Cognito setear/leer la pwd.
export type ProfileSource = 'primary' | 'business'

export async function findProfileByEmailAnySource(
  email: string,
): Promise<{ profile: Profile; source: ProfileSource } | null> {
  const primary = await findProfileByEmail(email)
  if (primary) return { profile: primary, source: 'primary' }

  const business = await findBusinessProfileByEmail(email)
  if (business) return { profile: business, source: 'business' }

  return null
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
// Business users live in Citify's countrify.profiles (shared via public.businesses).
// We accept them in Countrify only when role = 'negocio_admin' and they have a
// linked business. Anything else stays out.
// ----------------------------------------------------------------------------

const BUSINESS_PROFILE_SELECT = `
  select id, email, full_name, role, avatar_text, business_id,
         null::uuid as building_id, null::text as floor, null::text as unit,
         phone, password_must_change, created_at
  from countrify.profiles
  where role = 'negocio_admin'
    and business_id is not null
`

// Upserta un profile de negocio en countrify.profiles (schema compartido con
// Citify). Lo usa el super_admin cuando crea un business + admin: el FK
// public.businesses.owner_profile_id apunta a countrify.profiles(id), asi que
// el row debe vivir ahi (no en countrify.profiles).
export async function upsertBusinessProfile(input: {
  id: string
  email: string
  fullName: string
  avatarText: string
  phone: string | null
  businessId: string | null
  passwordMustChangeOnCreate?: boolean
}): Promise<Profile> {
  const result = await pgQuery(
    `
      insert into countrify.profiles (id, email, full_name, avatar_text, role, phone, business_id, password_must_change)
      values ($1, lower($2), $3, $4, 'negocio_admin', $5, $6, coalesce($7, false))
      on conflict (id) do update set
        email = excluded.email,
        full_name = excluded.full_name,
        avatar_text = excluded.avatar_text,
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
