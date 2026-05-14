'use client'

import { useState } from 'react'
import { Calendar, CheckCircle, Tag, Ticket, TrendingUp } from 'lucide-react'
import type { Promotion } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface PromotionCardProps {
  promotion: Promotion
  showUseCoupon?: boolean
  showAnalytics?: boolean
  onEdit?: (promotion: Promotion) => void
  onDelete?: (id: string) => void
  onUse?: (promotion: Promotion) => void
  showSaveAction?: boolean
  isSaved?: boolean
  onSaveToggle?: (promotion: Promotion) => void
  showUseAction?: boolean
  isUsed?: boolean
  onMarkUsed?: (promotion: Promotion) => void
}

export function PromotionCard({
  promotion,
  showUseCoupon,
  showAnalytics,
  onEdit,
  onDelete,
  onUse,
  showSaveAction,
  isSaved,
  onSaveToggle,
  showUseAction,
  isUsed,
  onMarkUsed,
}: PromotionCardProps) {
  const [used, setUsed] = useState(false)

  const handleUseCoupon = () => {
    if (onUse) {
      onUse(promotion)
    } else {
      setUsed(true)
    }
  }

  const isExpired = new Date(promotion.expirationDate) < new Date()
  const daysLeft = Math.ceil((new Date(promotion.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="glass-card glass-card-hover rounded-xl p-5 flex flex-col gap-4">
      {promotion.imageUrl ? (
        <div className="rounded-xl overflow-hidden border border-border/40 bg-secondary/20 aspect-[16/9]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={promotion.imageUrl} alt={promotion.title} className="w-full h-full object-cover" />
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-xs border-primary/30 text-muted-foreground">
              {promotion.category}
            </Badge>
            {isExpired ? <Badge variant="destructive" className="text-xs">Vencida</Badge> : null}
          </div>
          <h3 className="font-semibold text-foreground leading-snug text-balance">{promotion.title}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{promotion.businessName}</p>
        </div>
        <div
          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-center"
          style={{ background: 'linear-gradient(135deg, #11225022, #0a183822)', border: '1px solid rgba(17, 34, 80,0.2)' }}
        >
          <span className="font-bold text-lg text-primary">{promotion.discount}</span>
          <p className="text-xs text-muted-foreground">DTO</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{promotion.description}</p>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {isExpired
            ? 'Vencida'
            : daysLeft <= 7
              ? `quedan ${daysLeft}d`
              : new Date(promotion.expirationDate).toLocaleDateString('es-AR', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        {showAnalytics ? (
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            {promotion.usageCount} usados
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" />
            {promotion.usageCount} canjeados
          </span>
        )}
      </div>

      {showSaveAction ? (
        <div className="flex gap-2">
          {isSaved ? (
            <Button size="sm" className="flex-1 btn-premium gap-2 cursor-pointer" onClick={() => onSaveToggle?.(promotion)}>
              <CheckCircle className="w-4 h-4" /> En mi billetera
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="flex-1 text-muted-foreground hover:text-foreground gap-2 cursor-pointer" onClick={() => onSaveToggle?.(promotion)} disabled={isExpired}>
              <Ticket className="w-4 h-4" /> Quiero este cupón
            </Button>
          )}
        </div>
      ) : null}

      {showUseAction ? (
        <div className="flex gap-2">
          {!isUsed ? (
            <>
              <Button size="sm" variant="outline" className="flex-1 text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => onUse?.(promotion)}>
                Ver QR
              </Button>
              <Button size="sm" className="flex-1 btn-premium cursor-pointer" disabled={isExpired} onClick={() => onMarkUsed?.(promotion)}>
                Marcar Usado
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled className="flex-1 opacity-50 cursor-not-allowed">
              Ya utilizado
            </Button>
          )}
        </div>
      ) : null}

      {showUseCoupon && !showSaveAction && !showUseAction ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (used) {
                setUsed(false)
              } else {
                setUsed(true)
              }
            }}
          >
            {used ? 'Guardado' : 'Guardar'}
          </Button>
          <Button size="sm" disabled={isExpired} onClick={handleUseCoupon} className="flex-1 btn-premium">
            {isExpired ? 'Vencida' : 'Ver QR'}
          </Button>
        </div>
      ) : null}

      {onEdit || onDelete ? (
        <div className="flex gap-2">
          {onEdit ? (
            <Button size="sm" variant="outline" onClick={() => onEdit(promotion)} className="flex-1 border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary">
              Editar
            </Button>
          ) : null}
          {onDelete ? (
            <Button size="sm" variant="destructive" onClick={() => onDelete(promotion.id)} className="flex-1">
              Eliminar
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
