'use client'

import { useMemo, useState } from 'react'
import { CalendarRange, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const MONTH_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

const MONTH_LONG = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export type PeriodValue = { year: number; month: number } | null

export type PeriodOption = { year: number; month: number }

type Props = {
  /** Valor seleccionado. null = "todos" (sólo aplica si allowAll). */
  value: PeriodValue
  onChange: (value: PeriodValue) => void
  /** Períodos disponibles (con datos). Se resaltan en el grid. */
  availablePeriods: ReadonlyArray<PeriodOption>
  /** Permitir opción "Todos los períodos" (default: false). */
  allowAll?: boolean
  /** Etiqueta cuando allowAll y value=null. */
  allLabel?: string
  /** Placeholder cuando no hay value y no allowAll. */
  placeholder?: string
  /** Etiqueta corta antes del valor en el trigger (ej. "Período"). */
  label?: string
  /** Tamaño del trigger. */
  size?: 'sm' | 'md'
  /** Forzar deshabilitar meses sin datos (default: true). */
  onlyAvailableMonths?: boolean
  className?: string
  align?: 'start' | 'center' | 'end'
}

export function PeriodPicker({
  value,
  onChange,
  availablePeriods,
  allowAll = false,
  allLabel = 'Todos los períodos',
  placeholder = 'Elegí período',
  label,
  size = 'sm',
  onlyAvailableMonths = true,
  className,
  align = 'start',
}: Props) {
  const [open, setOpen] = useState(false)

  // Set de "year-month" disponibles, y conjunto de años con datos.
  const { availableSet, yearsWithData, minYear, maxYear } = useMemo(() => {
    const set = new Set<string>()
    const years = new Set<number>()
    for (const p of availablePeriods) {
      set.add(`${p.year}-${p.month}`)
      years.add(p.year)
    }
    const arr = Array.from(years).sort((a, b) => a - b)
    const today = new Date()
    years.add(today.getFullYear())
    return {
      availableSet: set,
      yearsWithData: arr,
      minYear: arr.length ? arr[0] : today.getFullYear(),
      maxYear: Math.max(arr[arr.length - 1] ?? today.getFullYear(), today.getFullYear()),
    }
  }, [availablePeriods])

  // Año actualmente "navegado" en el grid (independiente del seleccionado).
  const today = new Date()
  const initialYear = value?.year ?? today.getFullYear()
  const [viewYear, setViewYear] = useState<number>(initialYear)

  // Cuando se abre, sincronizar la vista con el valor activo.
  function handleOpenChange(next: boolean) {
    if (next) {
      setViewYear(value?.year ?? today.getFullYear())
    }
    setOpen(next)
  }

  // Períodos recientes (últimos 6 disponibles, ordenados desc).
  const recent = useMemo(() => {
    return [...availablePeriods]
      .sort((a, b) => (b.year - a.year) * 100 + (b.month - a.month))
      .slice(0, 6)
  }, [availablePeriods])

  const triggerLabel = value
    ? `${MONTH_LONG[value.month - 1]} ${value.year}`
    : allowAll
      ? allLabel
      : placeholder

  const triggerHeight = size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm'

  function selectPeriod(year: number, month: number) {
    onChange({ year, month })
    setOpen(false)
  }

  function selectAll() {
    onChange(null)
    setOpen(false)
  }

  // Rango de navegación: 1 año antes del mínimo hasta 1 año después del actual.
  const navMin = minYear - 1
  const navMax = Math.max(maxYear, today.getFullYear()) + 1

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={[
          'inline-flex items-center gap-1.5 rounded-md border border-input bg-background font-medium',
          'hover:bg-accent hover:text-accent-foreground transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          triggerHeight,
          className ?? '',
        ].join(' ')}
        aria-label={`${label ?? 'Período'}: ${triggerLabel}`}
      >
        <CalendarRange className="w-3.5 h-3.5 text-muted-foreground" />
        {label ? <span className="text-muted-foreground font-normal mr-0.5">{label}:</span> : null}
        <span className="truncate">{triggerLabel}</span>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={6}
        className="p-0 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden"
      >
        {/* Opción Todos */}
        {allowAll ? (
          <button
            type="button"
            onClick={selectAll}
            className={[
              'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left border-b border-border/40',
              'hover:bg-accent hover:text-accent-foreground transition-colors',
              value === null ? 'bg-primary/10 text-primary font-medium' : '',
            ].join(' ')}
          >
            <span>{allLabel}</span>
            {value === null ? <Check className="w-4 h-4" /> : null}
          </button>
        ) : null}

        {/* Recientes */}
        {recent.length > 0 ? (
          <div className="px-3 pt-3 pb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
              Recientes
            </p>
            <div className="flex flex-wrap gap-1">
              {recent.map((p) => {
                const isActive = value?.year === p.year && value?.month === p.month
                return (
                  <button
                    key={`${p.year}-${p.month}`}
                    type="button"
                    onClick={() => selectPeriod(p.year, p.month)}
                    className={[
                      'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground hover:bg-muted/70',
                    ].join(' ')}
                  >
                    {MONTH_SHORT[p.month - 1]} {String(p.year).slice(-2)}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* Navegador de años + grilla de meses */}
        <div className="px-3 pb-3 pt-2 border-t border-border/40">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewYear((y) => Math.max(navMin, y - 1))}
              disabled={viewYear <= navMin}
              className="p-1 rounded-md hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Año anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="font-serif text-sm font-semibold tabular-nums">{viewYear}</div>
            <button
              type="button"
              onClick={() => setViewYear((y) => Math.min(navMax, y + 1))}
              disabled={viewYear >= navMax}
              className="p-1 rounded-md hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Año siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {MONTH_SHORT.map((name, idx) => {
              const month = idx + 1
              const isAvailable = availableSet.has(`${viewYear}-${month}`)
              const isActive = value?.year === viewYear && value?.month === month
              const isCurrent =
                viewYear === today.getFullYear() && month === today.getMonth() + 1
              const disabled = onlyAvailableMonths && !isAvailable && !isCurrent

              return (
                <button
                  key={month}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectPeriod(viewYear, month)}
                  className={[
                    'relative rounded-md py-1.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : isAvailable || isCurrent
                        ? 'bg-muted/40 text-foreground hover:bg-accent hover:text-accent-foreground'
                        : 'text-muted-foreground/40 cursor-not-allowed',
                  ].join(' ')}
                  title={isCurrent ? `${MONTH_LONG[idx]} ${viewYear} (mes actual)` : `${MONTH_LONG[idx]} ${viewYear}`}
                >
                  {name}
                  {isCurrent && !isActive ? (
                    <span
                      className="absolute top-1 right-1 w-1 h-1 rounded-full bg-primary"
                      aria-hidden
                    />
                  ) : null}
                </button>
              )
            })}
          </div>

          {yearsWithData.length > 1 ? (
            <p className="mt-2 text-[10px] text-muted-foreground/80">
              Datos desde {yearsWithData[0]} a {yearsWithData[yearsWithData.length - 1]}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
