import { pgQuery } from '@/lib/db/postgres'

export interface BusinessRow {
  id: string
  name: string
  category: string
  description: string
  owner_profile_id: string | null
  logo_path: string | null
  created_at: string
  updated_at: string
}

export async function getBusinessByIdFromPostgres(id: string): Promise<BusinessRow | null> {
  const result = await pgQuery<BusinessRow>(
    `
      select
        id,
        name,
        category,
        description,
        owner_profile_id,
        logo_path,
        created_at::text as created_at,
        updated_at::text as updated_at
      from public.businesses
      where id = $1
      limit 1
    `,
    [id],
  )

  return result.rows[0] ?? null
}

export async function getAllBusinessesFromPostgres(): Promise<BusinessRow[]> {
  const result = await pgQuery<BusinessRow>(
    `
      select
        id,
        name,
        category,
        description,
        owner_profile_id,
        logo_path,
        created_at::text as created_at,
        updated_at::text as updated_at
      from public.businesses
      order by name asc
    `,
  )

  return result.rows
}
