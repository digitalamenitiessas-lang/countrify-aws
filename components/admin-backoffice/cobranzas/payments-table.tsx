'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { FilterX } from 'lucide-react'
import { Money } from '@/components/admin-backoffice/shared/money'
import { Button } from '@/components/ui/button'
import { PaymentDetailDrawer } from '@/components/admin-backoffice/cobranzas/payment-detail-drawer'
import { RegisterCollectionDialog } from '@/components/admin-backoffice/cobranzas/register-collection-dialog'
import type {
  IAdminCashAccountWithBalance,
  IAdminCollectionPayment,
  IAdminCollectionsFilters,
  IAdminOpenLiquidationItem,
} from '@/lib/types'

interface Props {
  payments: IAdminCollectionPayment[]
  filters: IAdminCollectionsFilters
  eligibleItems: IAdminOpenLiquidationItem[]
  cashAccounts: IAdminCashAccountWithBalance[]
  canVoid: boolean
  hasIssuedRuns: boolean // si false → empty state CTA
}

const MONTH_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
]

const METHOD_OPTIONS = ['transferencia', 'efectivo', 'cheque', 'deposito', 'debin', 'otro']

export function PaymentsTable({
  payments,
  filters,
  eligibleItems,
  cashAccounts,
  canVoid,
  hasIssuedRuns,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)

  // Lista de unidades únicas que aparecen en los payments o items abiertos —
  // las usamos para el dropdown de filtro de unidad.
  const unitOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of payments) {
      if (p.unitId && p.unitCode && !seen.has(p.unitId)) seen.set(p.unitId, p.unitCode)
    }
    for (const it of eligibleItems) {
      if (!seen.has(it.unitId)) seen.set(it.unitId, it.unitCode)
    }
    return Array.from(seen.entries())
      .map(([id, code]) => ({ id, code }))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [payments, eligibleItems])

  // Años disponibles (para el dropdown de período). Tomamos los años de los
  // payments + el año actual + el siguiente.
  const yearOptions = useMemo(() => {
    const years = new Set<number>()
    const today = new Date()
    years.add(today.getFullYear())
    for (const p of payments) {
      if (p.periodYear) years.add(p.periodYear)
    }
    for (const it of eligibleItems) {
      years.add(it.periodYear)
    }
    return Array.from(years).sort((a, b) => b - a)
  }, [payments, eligibleItems])

  function updateFilter(key: keyof IAdminCollectionsFilters, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    startTransition(() => {
      router.replace(`${pathname}${params.toString() ? '?' + params.toString() : ''}`, { scroll: false })
    })
  }

  function clearFilters() {
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  const hasActiveFilters =
    filters.periodYear !== null ||
    filters.periodMonth !== null ||
    filters.unitId !== null ||
    (filters.status !== 'live' && filters.status !== null) ||
    filters.method !== null

  const selectedPayment = selectedPaymentId
    ? payments.find((p) => p.id === selectedPaymentId) ?? null
    : null

  return (
    <div className="space-y-3">
      {/* Toolbar de filtros + CTA */}
      <div className="glass-card rounded-2xl p-3 flex flex-wrap gap-2 items-end">
        <SelectField
          label="Año"
          value={filters.periodYear?.toString() ?? ''}
          onChange={(v) => updateFilter('periodYear', v || null)}
          options={[
            { value: '', label: 'Todos' },
            ...yearOptions.map((y) => ({ value: String(y), label: String(y) })),
          ]}
        />
        <SelectField
          label="Mes"
          value={filters.periodMonth?.toString() ?? ''}
          onChange={(v) => updateFilter('periodMonth', v || null)}
          options={[
            { value: '', label: 'Todos' },
            ...MONTH_OPTIONS.map((m) => ({ value: String(m.value), label: m.label })),
          ]}
        />
        <SelectField
          label="Unidad"
          value={filters.unitId ?? ''}
          onChange={(v) => updateFilter('unitId', v || null)}
          options={[
            { value: '', label: 'Todas' },
            ...unitOptions.map((u) => ({ value: u.id, label: u.code })),
          ]}
        />
        <SelectField
          label="Estado"
          value={filters.status}
          onChange={(v) => updateFilter('status', v === 'live' ? null : v)}
          options={[
            { value: 'live', label: 'Vivos' },
            { value: 'voided', label: 'Anulados' },
            { value: 'all', label: 'Todos' },
          ]}
        />
        <SelectField
          label="Método"
          value={filters.method ?? ''}
          onChange={(v) => updateFilter('method', v || null)}
          options={[
            { value: '', label: 'Todos' },
            ...METHOD_OPTIONS.map((m) => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) })),
          ]}
        />
        {hasActiveFilters ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={clearFilters}
            className="gap-1.5 text-muted-foreground"
            disabled={pending}
          >
            <FilterX className="h-3.5 w-3.5" />
            Limpiar
          </Button>
        ) : null}
        <div className="ml-auto">
          <RegisterCollectionDialog eligibleItems={eligibleItems} cashAccounts={cashAccounts} />
        </div>
      </div>

      {/* Tabla */}
      {payments.length === 0 ? (
        <EmptyState hasIssuedRuns={hasIssuedRuns} hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters} />
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-3 font-medium">Recibo</th>
                <th className="text-left px-4 py-3 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 font-medium">Unidad</th>
                <th className="text-left px-4 py-3 font-medium">Vecino</th>
                <th className="text-right px-4 py-3 font-medium">Monto</th>
                <th className="text-left px-4 py-3 font-medium">Método</th>
                <th className="text-left px-4 py-3 font-medium">Referencia</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedPaymentId(p.id)}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/40 cursor-pointer"
                >
                  <td className="px-4 py-3 tabular-nums font-medium text-foreground">
                    {p.receiptNumber ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{p.paidAt}</td>
                  <td className="px-4 py-3 text-foreground">{p.unitCode ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[160px]">
                    {p.holderName ?? '—'}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${p.isVoid ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    <Money amount={p.amount} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{p.method ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[140px]">
                    {p.reference ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {p.isVoid ? (
                      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300">
                        Anulado
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                        Vivo
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      <PaymentDetailDrawer
        payment={selectedPayment}
        canVoid={canVoid}
        onClose={() => setSelectedPaymentId(null)}
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm h-9 min-w-[110px]"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function EmptyState({
  hasIssuedRuns,
  hasActiveFilters,
  onClearFilters,
}: {
  hasIssuedRuns: boolean
  hasActiveFilters: boolean
  onClearFilters: () => void
}) {
  if (hasActiveFilters) {
    return (
      <div className="glass-card rounded-2xl px-5 py-12 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          No hay pagos que coincidan con los filtros actuales.
        </p>
        <Button size="sm" variant="outline" onClick={onClearFilters}>
          Limpiar filtros
        </Button>
      </div>
    )
  }

  if (!hasIssuedRuns) {
    return (
      <div className="glass-card rounded-2xl px-5 py-12 text-center space-y-3">
        <h3 className="font-semibold text-foreground">Todavía no hay liquidaciones emitidas</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Para registrar cobranzas necesitás primero emitir al menos una liquidación. Generala
          desde la planilla del consorcio.
        </p>
        <Link href="/iadmin/liquidaciones" className="inline-block">
          <Button size="sm" variant="outline">
            Ir a Liquidaciones
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="glass-card rounded-2xl px-5 py-12 text-center text-sm text-muted-foreground">
      Aún no hay pagos registrados. Tocá "Registrar cobranza" arriba para cargar el primero.
    </div>
  )
}
