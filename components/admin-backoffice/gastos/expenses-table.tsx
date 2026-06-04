'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { IAdminExpenseStatus, IAdminExpenseSummary } from '@/lib/types'
import { Money } from '@/components/admin-backoffice/shared/money'
import { PeriodPicker } from '@/components/admin-backoffice/shared/period-picker'
import { RepeatPreviousMonthButton } from '@/components/admin-backoffice/gastos/repeat-previous-month-button'

const EXPENSE_STATUS_LABELS: Record<IAdminExpenseStatus, string> = {
  draft: 'Borrador',
  pending_review: 'Pendiente revisión',
  needs_doc: 'Falta documento',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  imputed: 'Imputado',
}

const EXPENSE_STATUS_TONE: Record<IAdminExpenseStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_review: 'bg-amber-100 text-amber-800',
  needs_doc: 'bg-orange-100 text-orange-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  imputed: 'bg-sky-100 text-sky-800',
}

const FILTERS: ReadonlyArray<{ value: 'all' | IAdminExpenseStatus; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending_review', label: 'A revisar' },
  { value: 'needs_doc', label: 'Falta doc' },
  { value: 'approved', label: 'Aprobados' },
  { value: 'imputed', label: 'Imputados' },
  { value: 'draft', label: 'Borrador' },
  { value: 'rejected', label: 'Rechazados' },
]

export function ExpensesTable({
  expenses,
  repeatPropertyId,
}: {
  expenses: IAdminExpenseSummary[]
  /** Si hay un consorcio activo, habilita repetir gastos del mes anterior en el período filtrado. */
  repeatPropertyId?: string | null
}) {
  const searchParams = useSearchParams()
  const initialStatus = (searchParams?.get('status') as IAdminExpenseStatus | 'all' | null) ?? 'all'
  const [statusFilter, setStatusFilter] = useState<'all' | IAdminExpenseStatus>(
    isValidStatus(initialStatus) ? initialStatus : 'all',
  )
  // Filtro de período: null = todos, o { year, month }
  const [periodFilter, setPeriodFilter] = useState<{ year: number; month: number } | null>(null)

  // Si cambia el query param desde afuera, sincronizar.
  useEffect(() => {
    const s = searchParams?.get('status')
    if (s && isValidStatus(s)) setStatusFilter(s as 'all' | IAdminExpenseStatus)
  }, [searchParams])

  // Lista única de períodos presentes.
  const periodOptions = useMemo(() => {
    const seen = new Set<string>()
    const options: { year: number; month: number }[] = []
    for (const e of expenses) {
      if (e.periodYear == null || e.periodMonth == null) continue
      const key = `${e.periodYear}-${e.periodMonth}`
      if (seen.has(key)) continue
      seen.add(key)
      options.push({ year: e.periodYear, month: e.periodMonth })
    }
    return options
  }, [expenses])

  const periodFiltered = useMemo(() => {
    if (periodFilter === null) return expenses
    return expenses.filter(
      (e) => e.periodYear === periodFilter.year && e.periodMonth === periodFilter.month,
    )
  }, [expenses, periodFilter])

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: periodFiltered.length }
    for (const e of periodFiltered) {
      map[e.status] = (map[e.status] ?? 0) + 1
    }
    return map
  }, [periodFiltered])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return periodFiltered
    return periodFiltered.filter((e) => e.status === statusFilter)
  }, [periodFiltered, statusFilter])

  if (expenses.length === 0) {
    const now = new Date()
    return (
      <div className="glass-card rounded-2xl px-5 py-12 text-center text-sm text-muted-foreground space-y-4">
        <p>No hay gastos cargados todavía.</p>
        {repeatPropertyId ? (
          <div className="flex justify-center">
            <RepeatPreviousMonthButton
              managedPropertyId={repeatPropertyId}
              targetYear={now.getFullYear()}
              targetMonth={now.getMonth() + 1}
              targetHasExpenses={false}
            />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <PeriodPicker
          label="Período"
          value={periodFilter}
          onChange={setPeriodFilter}
          availablePeriods={periodOptions}
          allowAll
          allLabel="Todos"
        />
        {repeatPropertyId && periodFilter ? (
          <RepeatPreviousMonthButton
            managedPropertyId={repeatPropertyId}
            targetYear={periodFilter.year}
            targetMonth={periodFilter.month}
            targetHasExpenses={periodFiltered.length > 0}
          />
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => {
          const isActive = statusFilter === f.value
          const count = counts[f.value] ?? 0
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              ].join(' ')}
            >
              {f.label}
              <span
                className={[
                  'tabular-nums text-[10px] rounded-full px-1.5 py-px',
                  isActive ? 'bg-primary-foreground/20' : 'bg-background/60',
                ].join(' ')}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No hay gastos con el filtro seleccionado.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
                <th className="text-left px-5 py-3 font-medium">Gasto</th>
                <th className="text-left px-5 py-3 font-medium">Consorcio</th>
                <th className="text-left px-5 py-3 font-medium">Proveedor</th>
                <th className="text-left px-5 py-3 font-medium">Tipo</th>
                <th className="text-left px-5 py-3 font-medium">Estado</th>
                <th className="text-right px-5 py-3 font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((expense) => (
                <tr key={expense.id} className="border-b border-border/30 last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-3">
                    <Link href={`/iadmin/gastos/${expense.id}`} className="font-medium text-foreground hover:text-primary">
                      {expense.description}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {expense.issuedAt ?? expense.createdAt.slice(0, 10)}
                      {expense.periodYear && expense.periodMonth
                        ? ` · Imp. ${String(expense.periodMonth).padStart(2, '0')}/${expense.periodYear}`
                        : ''}
                      {expense.pendingExtraction ? ' · doc por validar' : ''}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{expense.managedPropertyName}</td>
                  <td className="px-5 py-3 text-muted-foreground">{expense.providerName ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        expense.expenseKind === 'extraordinaria'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {expense.expenseKind === 'extraordinaria' ? 'Extraordinaria' : 'Ordinaria'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${EXPENSE_STATUS_TONE[expense.status]}`}
                    >
                      {EXPENSE_STATUS_LABELS[expense.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-foreground">
                    <Money amount={expense.amount} currency={expense.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function isValidStatus(s: string | null): s is IAdminExpenseStatus | 'all' {
  if (!s) return false
  return (
    s === 'all' ||
    s === 'draft' ||
    s === 'pending_review' ||
    s === 'needs_doc' ||
    s === 'approved' ||
    s === 'rejected' ||
    s === 'imputed'
  )
}
