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
