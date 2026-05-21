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
    `update public.profiles set password_must_change = false where id = $1`,
    [profileId],
  )
}

export async function markPasswordMustChange(profileId: string): Promise<void> {
  await pgQuery(
    `update countrify.profiles set password_must_change = true where id = $1`,
    [profileId],
  )
  await pgQuery(
    `update public.profiles set password_must_change = true where id = $1`,
    [profileId],
  )
}

// Busca un profile por email en ambos schemas. countrify.profiles (vecinos/
// admins) tiene prioridad; si no aparece ahi, prueba public.profiles
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
// Business users live in Citify's public.profiles (shared via public.businesses).
// We accept them in Countrify only when role = 'negocio_admin' and they have a
// linked business. Anything else stays out.
// ----------------------------------------------------------------------------

const BUSINESS_PROFILE_SELECT = `
  select id, email, full_name, role, avatar_text, business_id,
         null::uuid as building_id, null::text as floor, null::text as unit,
         phone, password_must_change, created_at
  from public.profiles
  where role = 'negocio_admin'
    and business_id is not null
`

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
