import { PromotionRow } from '@/components/superadmin/shared'
import { getSuperAdminDashboardData } from '@/lib/data'

export default async function PromocionesPage() {
  const data = await getSuperAdminDashboardData()
  return (
    <div>
      <div className="mb-6">
        <h2 className="font-bold text-foreground text-lg leading-tight">Promociones</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{data.promotions.length} promociones cargadas</p>
      </div>
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="divide-y divide-border/30">
          {data.promotions.map((promotion) => (
            <PromotionRow key={promotion.id} promotion={promotion} />
          ))}
          {data.promotions.length === 0 && (
            <div className="px-5 py-8 text-center text-muted-foreground text-sm">No hay promociones cargadas.</div>
          )}
        </div>
      </div>
    </div>
  )
}
