import { pgQuery } from '@/lib/db/postgres'

export interface BusinessRow {
  id: string
  name: string
  category: string
  description: string
  address: string | null
  latitude: string | number | null
  longitude: string | number | null
  owner_profile_id: string | null
  logo_path: string | null
  created_at: string
  updated_at: string
}

const BUSINESS_SELECT_COLUMNS = `
  id,
  name,
  category,
  description,
  address,
  latitude,
  longitude,
  owner_profile_id,
  logo_path,
  created_at::text as created_at,
  updated_at::text as updated_at
`

export async function getBusinessByIdFromPostgres(id: string): Promise<BusinessRow | null> {
  const result = await pgQuery<BusinessRow>(
    `select ${BUSINESS_SELECT_COLUMNS} from public.businesses where id = $1 limit 1`,
    [id],
  )

  return result.rows[0] ?? null
}

export async function getAllBusinessesFromPostgres(): Promise<BusinessRow[]> {
  const result = await pgQuery<BusinessRow>(
    `select ${BUSINESS_SELECT_COLUMNS} from public.businesses order by name asc`,
  )

  return result.rows
}
