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
}): Promise<Profile> {
  const result = await pgQuery(
    `
      insert into countrify.profiles (id, email, full_name, avatar_text, role, phone, building_id, business_id)
      values ($1, lower($2), $3, $4, $5, $6, $7, $8)
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
    ],
  )

  return mapProfileRow(result.rows[0])
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
