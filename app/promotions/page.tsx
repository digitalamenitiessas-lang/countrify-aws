import { PromotionsBrowser } from '@/components/promotions-browser'
import { getPromotionsPageData } from '@/lib/data'

export default async function PromotionsPage() {
  const { promotions } = await getPromotionsPageData()
  return <PromotionsBrowser promotions={promotions} />
}
