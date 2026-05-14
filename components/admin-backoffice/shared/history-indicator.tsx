'use client'

import { Redo2, Undo2 } from 'lucide-react'

type Props = {
  undoLabel?: string
  redoLabel?: string
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

/**
 * Controles discretos de deshacer / rehacer, estilo barra de herramientas.
 * Muestran el label de la próxima operación reversible al hover.
 */
export function HistoryIndicator({
  undoLabel,
  redoLabel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Historial de edición">
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title={canUndo ? `Deshacer: ${undoLabel ?? ''}` : 'Nada que deshacer'}
        className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border/40 disabled:hover:text-muted-foreground"
      >
        <Undo2 className="w-3 h-3" />
        <span className="kbd-hint">⌘Z</span>
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title={canRedo ? `Rehacer: ${redoLabel ?? ''}` : 'Nada que rehacer'}
        className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border/40 disabled:hover:text-muted-foreground"
      >
        <Redo2 className="w-3 h-3" />
        <span className="kbd-hint">⌘⇧Z</span>
      </button>
    </span>
  )
}
