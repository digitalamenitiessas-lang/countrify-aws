import { MapPin, MessageCircle, Package } from 'lucide-react'
import type { MarketplaceItem } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface MarketplaceCardProps {
  item: MarketplaceItem
  onContact?: (item: MarketplaceItem) => void
}

export function MarketplaceCard({ item, onContact }: MarketplaceCardProps) {
  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'Nuevo':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'Como Nuevo':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'Buen Estado':
        return 'bg-amber-100 text-amber-800 border-amber-200'
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200'
    }
  }

  return (
    <div className="glass-card glass-card-hover rounded-xl p-5 flex flex-col gap-4 border border-border/50">
      {item.imageUrl ? (
        <div className="rounded-xl overflow-hidden border border-border/40 bg-secondary/20 aspect-[4/3]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className={`text-xs border ${getConditionColor(item.condition)}`}>
              {item.condition}
            </Badge>
          </div>
          <h3 className="font-semibold text-foreground leading-snug text-balance line-clamp-2">{item.title}</h3>
          <p className="text-2xl font-bold text-primary mt-2">${item.price.toLocaleString('es-AR')}</p>
        </div>
        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-secondary/50 flex items-center justify-center border border-border/30 overflow-hidden">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <Package className="w-6 h-6 text-muted-foreground opacity-50" />
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 min-h-[60px]">{item.description}</p>

      <div className="flex items-center gap-3 pt-3 mt-auto border-t border-border/30">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #112250, #0a1838)' }}>
          {item.sellerAvatar || item.sellerId.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-medium text-foreground truncate">{item.sellerName || 'Vecino Anonimo'}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span className="truncate">Tu Country</span>
          </div>
        </div>

        <Button size="sm" className="btn-premium gap-1.5 px-3" onClick={() => onContact?.(item)}>
          <MessageCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Contactar</span>
        </Button>
      </div>
    </div>
  )
}
