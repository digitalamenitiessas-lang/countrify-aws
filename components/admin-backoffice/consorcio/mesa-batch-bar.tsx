'use client'

import { useState } from 'react'
import { ArrowRight, Check, Copy, Eraser, Loader2, X } from 'lucide-react'

type Props = {
  count: number
  onClear: () => void
  onApplyDelta: (modifier: DeltaModifier) => Promise<void>
  onClearValues: () => Promise<void>
  onCopy?: () => Promise<void> | void
}

export type DeltaModifier =
  | { kind: 'multiply'; factor: number } // *1.1
  | { kind: 'percent'; pct: number } // +10% o -5%
  | { kind: 'absolute'; value: number } // =50000
  | { kind: 'add'; delta: number } // +500 o -500

/**
 * Parsea inputs tipo:
 *   "+10%"       → percent 10
 *   "-5%"        → percent -5
 *   "*1.05"      → multiply 1.05
 *   "=50000"     → absolute 50000
 *   "+1000" /-1000 → add 1000
 *   "1000"       → absolute 1000
 */
function parseDelta(input: string): DeltaModifier | null {
  const s = input.trim().replace(/\s/g, '')
  if (!s) return null

  // Porcentaje
  if (s.endsWith('%')) {
    const raw = s.slice(0, -1).replace(/\./g, '').replace(',', '.')
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    return { kind: 'percent', pct: n }
  }

  // Absoluto (=)
  if (s.startsWith('=')) {
    const raw = s.slice(1).replace(/\./g, '').replace(',', '.')
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return null
    return { kind: 'absolute', value: n }
  }

  // Multiplicador (*)
  if (s.startsWith('*') || s.startsWith('x') || s.startsWith('X')) {
    const raw = s.slice(1).replace(/\./g, '').replace(',', '.')
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return null
    return { kind: 'multiply', factor: n }
  }

  // Suma o resta (+/-)
  if (s.startsWith('+') || s.startsWith('-')) {
    const sign = s.startsWith('-') ? -1 : 1
    const raw = s.slice(1).replace(/\./g, '').replace(',', '.')
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    return { kind: 'add', delta: sign * n }
  }

  // Solo número → absoluto
  const raw = s.replace(/\./g, '').replace(',', '.')
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return { kind: 'absolute', value: n }
}

export function applyDeltaToAmount(amount: number | null, mod: DeltaModifier): number | null {
  switch (mod.kind) {
    case 'percent':
      if (amount === null) return null
      return Math.round(amount * (1 + mod.pct / 100) * 100) / 100
    case 'multiply':
      if (amount === null) return null
      return Math.round(amount * mod.factor * 100) / 100
    case 'add':
      if (amount === null) return null
      return Math.round((amount + mod.delta) * 100) / 100
    case 'absolute':
      return mod.value
  }
}

export function MesaBatchBar({ count, onClear, onApplyDelta, onClearValues, onCopy }: Props) {
  const [input, setInput] = useState('')
  const [applying, setApplying] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [copying, setCopying] = useState(false)

  const parsed = input ? parseDelta(input) : null
  const canApply = Boolean(parsed) && !applying && !clearing

  async function handleApply() {
    if (!parsed) return
    setApplying(true)
    try {
      await onApplyDelta(parsed)
      setInput('')
    } finally {
      setApplying(false)
    }
  }

  function describe(mod: DeltaModifier | null): string | null {
    if (!mod) return null
    switch (mod.kind) {
      case 'percent':
        return `${mod.pct >= 0 ? '+' : ''}${mod.pct}% a cada una`
      case 'multiply':
        return `×${mod.factor} a cada una`
      case 'add':
        return `${mod.delta >= 0 ? '+' : ''}${mod.delta.toLocaleString('es-AR')} a cada una`
      case 'absolute':
        return `= ${mod.value.toLocaleString('es-AR')} en todas`
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 mesa-fade-in">
      <div className="mesa-card rounded-2xl flex items-center gap-2 pl-4 pr-2 py-2 shadow-[0_10px_40px_-10px_rgba(0, 0, 0,0.3)] backdrop-blur-xl">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground whitespace-nowrap">
          <span className="w-5 h-5 rounded-full bg-primary/15 text-primary inline-flex items-center justify-center text-[10px] font-semibold tabular-nums">
            {count}
          </span>
          {count === 1 ? 'celda' : 'celdas'}
        </span>

        <div className="w-px h-6 bg-border/50 mx-1" />

        <div className="flex items-center gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleApply()
              } else if (e.key === 'Escape') {
                setInput('')
              }
            }}
            placeholder="+10%  ·  *1.05  ·  =50000"
            className="w-44 rounded-md border border-border/50 bg-background px-2 py-1 text-xs tabular-nums focus:outline-none focus:border-primary/40 focus:shadow-[0_0_0_3px_rgba(17, 34, 80,0.08)] transition-shadow"
          />
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Aplicar (Enter)"
          >
            {applying ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <Check className="w-3 h-3" />
                Aplicar
              </>
            )}
          </button>
        </div>

        {parsed ? (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            <ArrowRight className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
            {describe(parsed)}
          </span>
        ) : null}

        <div className="w-px h-6 bg-border/50 mx-1" />

        {onCopy ? (
          <button
            type="button"
            onClick={async () => {
              setCopying(true)
              try {
                await onCopy()
              } finally {
                setCopying(false)
              }
            }}
            disabled={copying || applying || clearing}
            className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
            title="Copiar al portapapeles como TSV (pegá en Excel)"
          >
            {copying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
            Copiar
            <span className="kbd-hint">⌘C</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={async () => {
            setClearing(true)
            try {
              await onClearValues()
            } finally {
              setClearing(false)
            }
          }}
          disabled={clearing || applying || copying}
          className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background px-2 py-1 text-xs text-rose-700 hover:border-rose-300 hover:bg-rose-50 transition-colors disabled:opacity-50"
          title="Limpiar valores de las celdas seleccionadas"
        >
          {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eraser className="w-3 h-3" />}
          Limpiar
        </button>

        <button
          type="button"
          onClick={onClear}
          className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Deseleccionar (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
