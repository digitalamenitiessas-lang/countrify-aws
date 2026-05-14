import { pgQuery } from '@/lib/db/postgres'

export interface PromotionRow {
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

function basePromotionSelect() {
  return `
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
      null::text as published_month,
      null::uuid as source_promotion_id,
      p.image_path,
      p.is_active,
      count(pr.id)::int as usage_count
    from public.promotions p
    left join public.businesses b on b.id = p.business_id
    left join public.promotion_redemptions pr on pr.promotion_id = p.id
  `
}

export async function getPromotionsForBusinessFromPostgres(businessId: string): Promise<PromotionRow[]> {
  const result = await pgQuery<PromotionRow>(
    `
      ${basePromotionSelect()}
      where p.business_id = $1
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
        p.image_path,
        p.is_active
      order by p.created_at desc
    `,
    [businessId],
  )

  return result.rows
}

export async function getAllActivePromotionsFromPostgres(): Promise<PromotionRow[]> {
  const result = await pgQuery<PromotionRow>(
    `
      ${basePromotionSelect()}
      where p.is_active = true
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
        p.image_path,
        p.is_active
      order by p.created_at desc
    `,
  )

  return result.rows
}
