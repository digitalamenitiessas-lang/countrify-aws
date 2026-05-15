import { pgQuery } from '@/lib/db/postgres'

export interface PublicPromotionRow {
  id: string
  business_id: string
  business_name: string
  title: string
  description: string
  discount: string
  category: string
  expiration_date: string
  building_id: string | null
  created_at: string
  published_month: string | null
  source_promotion_id: string | null
  image_path: string | null
  is_active: boolean
  usage_count: number
}

export async function getPublicPromotionsFromPostgres(limit = 12): Promise<PublicPromotionRow[]> {
  const result = await pgQuery<PublicPromotionRow>(
    `
      select
        p.id,
        p.business_id,
        coalesce(b.name, 'Comercio') as business_name,
        p.title,
        p.description,
        p.discount,
        p.category,
        p.expiration_date::text as expiration_date,
        p.building_id,
        p.created_at::text as created_at,
        p.published_month::text as published_month,
        p.source_promotion_id,
        p.image_path,
        p.is_active,
        count(pr.id)::int as usage_count
      from public.promotions p
      left join public.businesses b on b.id = p.business_id
      left join countrify.promotion_redemptions pr on pr.promotion_id = p.id
      where p.is_active = true
        and p.expiration_date >= current_date
      group by
        p.id,
        p.business_id,
        b.name,
        p.title,
        p.description,
        p.discount,
        p.category,
        p.expiration_date,
        p.building_id,
        p.created_at,
        p.published_month,
        p.source_promotion_id,
        p.image_path,
        p.is_active
      order by p.created_at desc
      limit $1
    `,
    [limit],
  )

  return result.rows
}
