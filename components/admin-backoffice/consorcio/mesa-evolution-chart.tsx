'use client'

import { useMemo, useState } from 'react'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { IAdminMonthlyGrid } from '@/lib/types'

type Props = {
  months: IAdminMonthlyGrid['months']
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
}

/**
 * Bar chart SVG de la evolución del total mensual de los últimos N meses.
 * Muestra línea de promedio y resalta el mes actual. Sin dependencias.
 */
export function MesaEvolutionChart({ months }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const stats = useMemo(() => {
    const totals = months.map((m) => m.total ?? 0)
    const withData = totals.filter((n) => n > 0)
    const avg = withData.length > 0 ? withData.reduce((s, n) => s + n, 0) / withData.length : 0
    const max = Math.max(...totals, avg || 0)
    const last = totals[totals.length - 1] ?? 0
    const prev = totals[totals.length - 2] ?? 0
    const trend =
      prev > 0
        ? { pct: Math.round(((last - prev) / prev) * 1000) / 10, direction: last === prev ? 'flat' : last > prev ? 'up' : 'down' }
        : null
    return { totals, avg, max, trend }
  }, [months])

  // Layout
  const width = 720 // usaremos viewBox para ser responsive
  const height = 200
  const paddingTop = 16
  const paddingBottom = 34
  const paddingX = 12
  const availableW = width - paddingX * 2
  const availableH = height - paddingTop - paddingBottom
  const gap = 6
  const barW = (availableW - gap * (months.length - 1)) / months.length

  const avgY = paddingTop + availableH * (1 - (stats.avg > 0 ? stats.avg / stats.max : 0))

  const trendTone = stats.trend?.direction === 'down' ? 'down' : stats.trend?.direction === 'flat' ? 'flat' : 'up'
  const TrendIcon = trendTone === 'down' ? TrendingDown : trendTone === 'flat' ? Minus : TrendingUp

  return (
    <div className="mesa-fade-in">
      <div className="px-6 pt-4 pb-2 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Evolución — últimos {months.length} meses
          </p>
          <h4 className="font-serif text-base font-semibold text-foreground mt-0.5">
            Gastos totales por mes
          </h4>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Legend swatch="bg-primary/80" label="Mes actual" />
          <Legend swatch="bg-accent/70" label="Meses previos" />
          <Legend swatch="bg-amber-600 h-[2px] w-3 inline-block" label={`Promedio $ ${formatARS(stats.avg)}`} />
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto"
            preserveAspectRatio="none"
            role="img"
            aria-label="Evolución de gastos mensuales"
          >
            <defs>
              <linearGradient id="bar-grad-current" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.92" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.55" />
              </linearGradient>
              <linearGradient id="bar-grad-past" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#CCCCCC" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#E5E5E5" stopOpacity="0.55" />
              </linearGradient>
            </defs>

            {/* Grid líneas horizontales (25%, 50%, 75%) */}
            {[0.25, 0.5, 0.75].map((t) => (
              <line
                key={t}
                x1={paddingX}
                x2={width - paddingX}
                y1={paddingTop + availableH * t}
                y2={paddingTop + availableH * t}
                stroke="rgba(17, 34, 80, 0.08)"
                strokeDasharray="2 4"
              />
            ))}

            {/* Línea de promedio */}
            {stats.avg > 0 ? (
              <>
                <line
                  x1={paddingX}
                  x2={width - paddingX}
                  y1={avgY}
                  y2={avgY}
                  stroke="#d97706"
                  strokeOpacity={0.6}
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                />
              </>
            ) : null}

            {/* Barras */}
            {months.map((m, i) => {
              const total = stats.totals[i] ?? 0
              const h = stats.max > 0 ? (total / stats.max) * availableH : 0
              const x = paddingX + i * (barW + gap)
              const y = paddingTop + availableH - h
              const isHover = hoverIdx === i
              const fill = m.isCurrent ? 'url(#bar-grad-current)' : 'url(#bar-grad-past)'
              return (
                <g key={`${m.year}-${m.month}`}>
                  {/* Hover invisible extendido a toda la altura para UX */}
                  <rect
                    x={x - gap / 2}
                    y={paddingTop}
                    width={barW + gap}
                    height={availableH + paddingBottom}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                    style={{ cursor: total > 0 ? 'default' : 'default' }}
                  />
                  {/* Barra */}
                  <rect
                    x={x}
                    y={total > 0 ? y : paddingTop + availableH - 2}
                    width={barW}
                    height={total > 0 ? h : 2}
                    rx={3}
                    ry={3}
                    fill={total > 0 ? fill : 'rgba(17, 34, 80, 0.12)'}
                    style={{
                      transition: 'transform 180ms ease, filter 180ms ease',
                      transformOrigin: `${x + barW / 2}px ${paddingTop + availableH}px`,
                      transform: isHover ? 'scaleY(1.04)' : 'scaleY(1)',
                      filter: isHover ? 'brightness(1.08)' : 'none',
                    }}
                  />
                  {/* Monto flotante arriba del bar cuando hover */}
                  {isHover && total > 0 ? (
                    <text
                      x={x + barW / 2}
                      y={y - 6}
                      textAnchor="middle"
                      className="fill-foreground"
                      style={{ fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                    >
                      $ {formatARS(total)}
                    </text>
                  ) : null}
                  {/* Label de mes */}
                  <text
                    x={x + barW / 2}
                    y={height - 18}
                    textAnchor="middle"
                    className={m.isCurrent ? 'fill-primary' : 'fill-muted-foreground'}
                    style={{ fontSize: 10, fontWeight: m.isCurrent ? 600 : 400 }}
                  >
                    {m.label.split(' ')[0]}
                  </text>
                  <text
                    x={x + barW / 2}
                    y={height - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground/60"
                    style={{ fontSize: 9 }}
                  >
                    {m.label.split(' ')[1]}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* Badge del promedio */}
          {stats.avg > 0 ? (
            <div
              className="absolute right-4 flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-medium px-2 py-0.5 pointer-events-none"
              style={{ top: `calc(${(avgY / height) * 100}% - 10px)` }}
            >
              prom $ {formatARS(stats.avg)}
            </div>
          ) : null}
        </div>

        {stats.trend ? (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span
              className="delta-pill"
              data-tone={trendTone === 'down' ? 'down' : trendTone === 'flat' ? 'flat' : 'up'}
            >
              <TrendIcon className="w-2.5 h-2.5" />
              {stats.trend.pct >= 0 ? '+' : ''}
              {stats.trend.pct.toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">
              {trendTone === 'down'
                ? 'ahorraste respecto al mes pasado'
                : trendTone === 'flat'
                  ? 'estabilidad vs mes pasado'
                  : 'aumento respecto al mes pasado'}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${swatch}`} />
      {label}
    </span>
  )
}
