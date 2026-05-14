'use client'

import { useEffect, useState } from 'react'
import { Check, CloudOff, Loader2 } from 'lucide-react'

type Props = {
  lastSavedAt: Date | null
  pendingCount: number
}

/**
 * Indicador sutil de auto-save estilo Google Docs / Notion.
 * Estados:
 * - Idle (sin save todavía): nada
 * - Pending: "Guardando…" con spinner
 * - Saved: "Guardado hace X" con check verde; se actualiza cada 30s
 */
export function SavedIndicator({ lastSavedAt, pendingCount }: Props) {
  const [now, setNow] = useState<number>(() => Date.now())

  // Refrescar cada 20s mientras hay un lastSavedAt
  useEffect(() => {
    if (!lastSavedAt) return
    const id = window.setInterval(() => setNow(Date.now()), 20000)
    return () => window.clearInterval(id)
  }, [lastSavedAt])

  if (pendingCount > 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
        aria-live="polite"
      >
        <Loader2 className="w-3 h-3 animate-spin text-primary" />
        Guardando{pendingCount > 1 ? ` (${pendingCount})` : ''}…
      </span>
    )
  }

  if (!lastSavedAt) return null

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
      aria-live="polite"
      title={lastSavedAt.toLocaleTimeString('es-AR')}
    >
      <Check className="w-3 h-3 text-emerald-600" />
      Guardado {formatRelative(lastSavedAt, now)}
    </span>
  )
}

function formatRelative(date: Date, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - date.getTime()) / 1000))
  if (diffSec < 5) return 'recién'
  if (diffSec < 60) return `hace ${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `hace ${diffHr} h`
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

/**
 * Versión "pill" para cuando no hay conexión / error reciente
 */
export function SaveErrorPill() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
      <CloudOff className="w-3 h-3" />
      Error al guardar
    </span>
  )
}
