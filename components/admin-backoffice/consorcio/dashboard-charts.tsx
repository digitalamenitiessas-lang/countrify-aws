'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, ChevronRight, Receipt } from 'lucide-react'
import type {
  IAdminMonthlyTrendPoint,
  IAdminOverdueBucket,
  IAdminPayableProviderGroup,
} from '@/lib/types'

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
}

// ----------------------------------------------------------------------------
// Liquidado vs Cobrado — barras agrupadas por mes (SVG, sin dependencias)
// ----------------------------------------------------------------------------

export function CollectionTrendChart({ points }: { points: IAdminMonthlyTrendPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const stats = useMemo(() => {
    const max = Math.max(1, ...points.map((p) => Math.max(p.liquidated, p.collected)))
    const liqTotal = points.reduce((s, p) => s + p.liquidated, 0)
    const colTotal = points.reduce((s, p) => s + p.collected, 0)
    const avgRate = liqTotal > 0 ? Math.round((colTotal / liqTotal) * 100) : null
    return { max, avgRate }
  }, [points])

  if (points.length === 0) {
    return (
      <section className="glass-card rounded-2xl overflow-hidden">
        <Header
          title="Liquidado vs cobrado"
          subtitle="Evolución de los últimos meses"
        />
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          Todavía no hay liquidaciones emitidas para graficar.
        </div>
      </section>
    )
  }

  const width = 720
  const height = 220
  const paddingTop = 16
  const paddingBottom = 30
  const paddingX = 12
  const availableW = width - paddingX * 2
  const availableH = height - paddingTop - paddingBottom
  const groupGap = 10
  const groupW = (availableW - groupGap * (points.length - 1)) / points.length
  const barGap = 3
  const barW = Math.max(4, (groupW - barGap) / 2)

  return (
    <section className="glass-card rounded-2xl overflow-hidden">
      <Header
        title="Liquidado vs cobrado"
        subtitle={`Últimos ${points.length} meses${stats.avgRate !== null ? ` · cobranza promedio ${stats.avgRate}%` : ''}`}
        legend={
          <div className="flex items-center gap-3 text-xs">
            <Legend swatch="bg-accent/60" label="Liquidado" />
            <Legend swatch="bg-primary" label="Cobrado" />
          </div>
        }
      />

      <div className="px-4 pb-4 pt-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          preserveAspectRatio="none"
          role="img"
          aria-label="Liquidado versus cobrado por mes"
        >
          {[0.25, 0.5, 0.75].map((t) => (
            <line
              key={t}
              x1={paddingX}
              x2={width - paddingX}
              y1={paddingTop + availableH * t}
              y2={paddingTop + availableH * t}
              stroke="rgba(240, 78, 35, 0.08)"
              strokeDasharray="2 4"
            />
          ))}

          {points.map((p, i) => {
            const gx = paddingX + i * (groupW + groupGap)
            const hLiq = (p.liquidated / stats.max) * availableH
            const hCol = (p.collected / stats.max) * availableH
            const isHover = hoverIdx === i
            return (
              <g key={`${p.year}-${p.month}`}>
                <rect
                  x={gx}
                  y={paddingTop}
                  width={groupW}
                  height={availableH + paddingBottom}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                />
                {/* Liquidado */}
                <rect
                  x={gx}
                  y={paddingTop + availableH - hLiq}
                  width={barW}
                  height={Math.max(1, hLiq)}
                  rx={2}
                  fill="var(--accent)"
                  fillOpacity={isHover ? 0.8 : 0.55}
                />
                {/* Cobrado */}
                <rect
                  x={gx + barW + barGap}
                  y={paddingTop + availableH - hCol}
                  width={barW}
                  height={Math.max(1, hCol)}
                  rx={2}
                  fill="var(--primary)"
                  fillOpacity={isHover ? 1 : 0.85}
                />
                {isHover ? (
                  <text
                    x={gx + groupW / 2}
                    y={paddingTop + availableH - Math.max(hLiq, hCol) - 6}
                    textAnchor="middle"
                    className="fill-foreground"
                    style={{ fontSize: 10, fontWeight: 600 }}
                  >
                    {p.collectionRatePct !== null ? `${p.collectionRatePct}%` : '—'}
                  </text>
                ) : null}
                <text
                  x={gx + groupW / 2}
                  y={height - 10}
                  textAnchor="middle"
                  className={p.isCurrent ? 'fill-primary' : 'fill-muted-foreground'}
                  style={{ fontSize: 10, fontWeight: p.isCurrent ? 600 : 400 }}
                >
                  {p.periodLabel}
                </text>
              </g>
            )
          })}
        </svg>

        {hoverIdx !== null ? (
          <div className="mt-1 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>Liquidado <strong className="text-foreground">$ {formatARS(points[hoverIdx]!.liquidated)}</strong></span>
            <span>Cobrado <strong className="text-foreground">$ {formatARS(points[hoverIdx]!.collected)}</strong></span>
          </div>
        ) : null}
      </div>
    </section>
  )
}

// ----------------------------------------------------------------------------
// Morosidad por período — barras horizontales coloreadas por antigüedad
// ----------------------------------------------------------------------------

export function OverdueChart({
  buckets,
  totalAmount,
  totalUnits,
}: {
  buckets: IAdminOverdueBucket[]
  totalAmount: number
  totalUnits: number
}) {
  const max = Math.max(1, ...buckets.map((b) => b.totalAmount))

  return (
    <section className="glass-card rounded-2xl overflow-hidden">
      <Header
        title="Morosidad por período"
        subtitle="Deuda emitida sin cobrar, por mes liquidado"
        legend={
          buckets.length > 0 ? (
            <div className="flex items-center gap-1 rounded-full bg-rose-100 border border-rose-200 px-3 py-1 text-xs text-rose-800">
              {totalUnits} unidad{totalUnits === 1 ? '' : 'es'}
            </div>
          ) : null
        }
      />

      {buckets.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          No hay deudas registradas. Todo al día 👍
        </div>
      ) : (
        <div className="p-5 space-y-3">
          {buckets.slice(0, 8).map((b) => {
            const pct = (b.totalAmount / max) * 100
            // Más viejo => más intenso
            const tone =
              b.periodsOld >= 3 ? 'bg-rose-600' : b.periodsOld >= 2 ? 'bg-rose-500' : 'bg-amber-500'
            return (
              <div key={b.periodLabel}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-foreground">
                    {b.periodLabel}
                    <span className="text-muted-foreground">
                      {' '}· {b.periodsOld} mes{b.periodsOld === 1 ? '' : 'es'} · {b.unitsCount} u.
                    </span>
                  </span>
                  <span className="tabular-nums font-medium text-rose-700">$ {formatARS(b.totalAmount)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                  <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between pt-2 border-t border-border/40 text-sm">
            <span className="font-semibold text-foreground">Total adeudado</span>
            <span className="font-serif text-xl font-bold tabular-nums text-rose-800">$ {formatARS(totalAmount)}</span>
          </div>
        </div>
      )}
    </section>
  )
}

// ----------------------------------------------------------------------------
// Proveedores a pagar — integrado con gastos (mismos datos que Cuentas)
// ----------------------------------------------------------------------------

export function ProvidersPayableWidget({
  propertyId,
  groups,
  total,
}: {
  propertyId: string
  groups: IAdminPayableProviderGroup[]
  total: number
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const expensesCount = useMemo(
    () => groups.reduce((s, g) => s + g.expenses.length, 0),
    [groups],
  )

  return (
    <section className="glass-card rounded-2xl overflow-hidden">
      <Header
        title="Proveedores a pagar"
        subtitle="Gastos aprobados/imputados sin pago registrado en caja"
        legend={
          <Link
            href={`/iadmin/consorcios/${propertyId}/cuentas`}
            className="rounded-full border border-primary/30 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 flex items-center gap-1 shrink-0"
          >
            Ir a pagar <ArrowRight className="w-3 h-3" />
          </Link>
        }
      />

      {groups.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          No hay gastos pendientes de pago. Todo conciliado con caja 👍
        </div>
      ) : (
        <ul className="divide-y divide-border/30">
          {groups.map((g) => {
            const key = g.providerId ?? g.providerName
            const isOpen = openKey === key
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setOpenKey((cur) => (cur === key ? null : key))}
                  className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors text-left"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm text-foreground truncate">{g.providerName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {g.expenses.length} gasto{g.expenses.length === 1 ? '' : 's'}
                        {g.oldestDate ? ` · desde ${g.oldestDate}` : ''}
                      </div>
                    </div>
                  </div>
                  <span className="font-medium tabular-nums text-foreground shrink-0">
                    $ {formatARS(g.totalAmount)}
                  </span>
                </button>

                {isOpen ? (
                  <ul className="bg-muted/20 px-5 pb-2">
                    {g.expenses.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-3 py-1.5 text-xs border-t border-border/20 first:border-0"
                      >
                        <div className="min-w-0">
                          <div className="text-foreground truncate flex items-center gap-1.5">
                            <Receipt className="w-3 h-3 text-muted-foreground shrink-0" />
                            {e.description || 'Gasto sin descripción'}
                          </div>
                          <div className="text-[10px] text-muted-foreground pl-[18px]">
                            {[
                              e.category,
                              e.documentNumber ? `${e.documentType ?? 'comp.'} ${e.documentNumber}` : null,
                              e.issuedAt,
                              e.status,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                        <span className="tabular-nums text-foreground shrink-0">$ {formatARS(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
          <li className="flex items-center justify-between px-5 py-3 text-sm bg-muted/40">
            <span className="font-semibold text-foreground">
              Total a pagar
              <span className="text-muted-foreground font-normal">
                {' '}· {groups.length} proveedor{groups.length === 1 ? '' : 'es'} · {expensesCount} gasto{expensesCount === 1 ? '' : 's'}
              </span>
            </span>
            <span className="font-serif text-xl font-bold tabular-nums text-foreground">$ {formatARS(total)}</span>
          </li>
        </ul>
      )}
    </section>
  )
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function Header({
  title,
  subtitle,
  legend,
}: {
  title: string
  subtitle?: string
  legend?: React.ReactNode
}) {
  return (
    <header className="px-5 py-4 flex items-start justify-between gap-3 border-b border-border/40">
      <div className="min-w-0">
        <h3 className="font-serif text-lg font-semibold text-foreground">{title}</h3>
        {subtitle ? <p className="text-xs mt-0.5 text-muted-foreground">{subtitle}</p> : null}
      </div>
      {legend}
    </header>
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
