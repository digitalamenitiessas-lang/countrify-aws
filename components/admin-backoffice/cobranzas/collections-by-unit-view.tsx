'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronRight, HandCoins, Loader2, TrendingUp, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/admin-backoffice/shared/money'
import { NeighborDrawer } from '@/components/admin-backoffice/consorcio/neighbor-drawer'
import { EmptyState } from '@/components/admin-backoffice/shared/empty-state'
import { PeriodPicker } from '@/components/admin-backoffice/shared/period-picker'
import type { IAdminCashAccountWithBalance, IAdminMesaState, IAdminMesaUnitLine } from '@/lib/types'
import { quickPayFromMesa } from '@/app/iadmin/consorcios/[id]/planilla/actions'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

type Filter = 'all' | 'pending' | 'paid'

type Props = {
  state: IAdminMesaState
  cashAccounts: IAdminCashAccountWithBalance[]
  canRegisterPayments: boolean
  propertyId: string
  propertyName: string
  year: number
  month: number
  availablePeriods: Array<{ year: number; month: number }>
}

export function CollectionsByUnitView({
  state,
  cashAccounts,
  canRegisterPayments,
  propertyId,
  propertyName,
  year,
  month,
  availablePeriods,
}: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [pending, startTransition] = useTransition()
  const [drawerUnit, setDrawerUnit] = useState<IAdminMesaUnitLine | null>(null)

  const activeAccount = cashAccounts.find((a) => a.isActive)

  const filtered = useMemo(() => {
    switch (filter) {
      case 'pending':
        return state.units.filter((u) => u.balance > 0.01)
      case 'paid':
        return state.units.filter((u) => u.subtotal > 0 && u.balance < 0.01)
      default:
        return state.units
    }
  }, [filter, state.units])

  const pendingCount = useMemo(
    () => state.units.filter((u) => u.balance > 0.01).length,
    [state.units],
  )
  const paidCount = useMemo(
    () => state.units.filter((u) => u.subtotal > 0 && u.balance < 0.01).length,
    [state.units],
  )

  // Refrescar cuando se cierra el drawer (por si se registró un pago adentro).
  useEffect(() => {
    if (drawerUnit === null) {
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerUnit])

  function handleQuickPay(unitId: string, amount: number) {
    startTransition(async () => {
      try {
        const result = await quickPayFromMesa({
          propertyId,
          year,
          month,
          unitId,
          amount,
        })
        toast.success(`Pago registrado · Recibo ${result.receiptNumber}`)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al registrar pago')
      }
    })
  }

  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`
  const currentPeriodValue = `${year}-${String(month).padStart(2, '0')}`

  // Aseguramos que el período actual aparezca aunque no haya datos todavía.
  const periodOptions = useMemo(() => {
    const seen = new Set<string>()
    const opts: Array<{ year: number; month: number }> = []
    for (const p of availablePeriods) {
      const k = `${p.year}-${p.month}`
      if (seen.has(k)) continue
      seen.add(k)
      opts.push({ year: p.year, month: p.month })
    }
    const currentKey = `${year}-${month}`
    if (!seen.has(currentKey)) opts.push({ year, month })
    return opts
  }, [availablePeriods, year, month])

  function changePeriod(next: { year: number; month: number } | null) {
    if (!next) return
    const value = `${next.year}-${String(next.month).padStart(2, '0')}`
    if (value === currentPeriodValue) return
    const params = new URLSearchParams(window.location.search)
    params.set('period', value)
    router.push(`/iadmin/cobranzas?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PeriodPicker
          label="Período"
          size="md"
          value={{ year, month }}
          onChange={changePeriod}
          availablePeriods={periodOptions}
        />
      </div>

      {/* KPIs arriba */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={TrendingUp}
          label="Cobrado del mes"
          value={<Money amount={state.totalCollected} minimumFractionDigits={0} maximumFractionDigits={0} />}
          hint={
            state.collectionRatePct !== null
              ? `${state.collectionRatePct}% sobre liquidado`
              : 'Sin liquidación emitida'
          }
          tone={
            state.collectionRatePct !== null && state.collectionRatePct >= 70
              ? 'success'
              : state.collectionRatePct !== null && state.collectionRatePct < 40
                ? 'danger'
                : undefined
          }
        />
        <KpiCard
          icon={HandCoins}
          label="Saldo pendiente"
          value={<Money amount={state.totalPending} minimumFractionDigits={0} maximumFractionDigits={0} />}
          hint={
            pendingCount > 0
              ? `${pendingCount} unidad${pendingCount === 1 ? '' : 'es'} con deuda`
              : 'Todo al día'
          }
          tone={pendingCount > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          icon={Wallet}
          label="Total liquidado"
          value={<Money amount={state.totalToDistribute + state.previousBalanceTotal} minimumFractionDigits={0} maximumFractionDigits={0} />}
          hint={state.hasRun ? `Período ${periodLabel}` : 'Aún sin emitir'}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Unidades al día"
          value={`${paidCount} / ${state.units.length}`}
          hint={
            state.units.length > 0
              ? `${Math.round((paidCount / state.units.length) * 100)}% del total`
              : 'Sin unidades'
          }
          tone={paidCount === state.units.length && state.units.length > 0 ? 'success' : undefined}
        />
      </section>

      {/* Empty state si no hay liquidación */}
      {!state.hasRun ? (
        <section className="glass-card rounded-2xl p-6">
          <EmptyState
            icon={HandCoins}
            title="Todavía no emitiste la liquidación de este período"
            description="Para empezar a cobrar, primero cargá los gastos del mes y emití la liquidación desde Mesa del mes."
            compact
          />
        </section>
      ) : (
        <section className="glass-card rounded-2xl overflow-hidden">
          {/* Header con filtros */}
          <header className="px-5 py-3 border-b border-border/40 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-serif text-lg font-semibold text-foreground">
                Cobranzas · {propertyName}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Período {periodLabel} · {state.units.length} unidades
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['all', 'pending', 'paid'] as const).map((f) => {
                const isActive = filter === f
                const count =
                  f === 'all' ? state.units.length : f === 'pending' ? pendingCount : paidCount
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={[
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70',
                    ].join(' ')}
                  >
                    {f === 'all' ? 'Todos' : f === 'pending' ? 'Con saldo' : 'Al día'}
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
          </header>

          {/* Aviso si no hay cuenta activa */}
          {canRegisterPayments && !activeAccount ? (
            <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
              No hay cuenta bancaria activa. Configurá una en{' '}
              <a href={`/iadmin/consorcios/${propertyId}/cuentas`} className="font-medium underline">
                Cuentas / CBU
              </a>{' '}
              para poder registrar pagos.
            </div>
          ) : null}

          {/* Tabla por unidad */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/20">
                  <th className="text-left px-4 py-2 font-medium">Unidad</th>
                  <th className="text-left px-4 py-2 font-medium">Titular</th>
                  <th className="text-right px-4 py-2 font-medium">Total</th>
                  <th className="text-right px-4 py-2 font-medium">Cobrado</th>
                  <th className="text-right px-4 py-2 font-medium">Saldo</th>
                  {canRegisterPayments ? <th className="px-2 py-2" /> : null}
                  <th className="px-2 py-2 w-6" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={canRegisterPayments ? 7 : 6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Sin unidades para mostrar con este filtro.
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => {
                    const isPaid = u.subtotal > 0 && u.balance < 0.01
                    return (
                      <tr
                        key={u.unitId}
                        className="border-b border-border/20 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setDrawerUnit(u)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setDrawerUnit(u)
                          }
                        }}
                        aria-label={`Ver estado de cuenta de ${u.unitCode}`}
                      >
                        <td className="px-4 py-2 font-medium text-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            {u.unitCode}
                            {isPaid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : null}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {u.holderName ?? <span className="italic">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {u.subtotal > 0 ? u.subtotal.toLocaleString('es-AR') : '—'}
                          {u.lateFee > 0 ? (
                            <div className="text-[10px] text-amber-700 mt-0.5">
                              +{u.lateFee.toLocaleString('es-AR')} mora
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-emerald-700">
                          {u.collected > 0 ? u.collected.toLocaleString('es-AR') : '—'}
                        </td>
                        <td className={`px-4 py-2 text-right tabular-nums ${u.balance > 0 ? 'text-rose-700 font-medium' : 'text-muted-foreground'}`}>
                          {u.balance > 0 ? u.balance.toLocaleString('es-AR') : '✓'}
                        </td>
                        {canRegisterPayments ? (
                          <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                            {u.balance > 0.01 && activeAccount && state.hasRun ? (
                              <Button
                                size="sm"
                                variant="default"
                                disabled={pending}
                                onClick={() => handleQuickPay(u.unitId, u.balance)}
                              >
                                {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Pagó'}
                              </Button>
                            ) : null}
                          </td>
                        ) : null}
                        <td className="px-2 py-2 text-right w-6">
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-medium">
                  <td colSpan={2} className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <Money amount={state.totalToDistribute + state.previousBalanceTotal} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">
                    <Money amount={state.totalCollected} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-rose-700">
                    <Money amount={state.totalPending} />
                  </td>
                  {canRegisterPayments ? <td /> : null}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="px-5 py-2 text-[10px] text-muted-foreground/80 italic border-t border-border/20">
            Click en cualquier unidad para ver su estado de cuenta completo e historial de pagos.
          </p>
        </section>
      )}

      <NeighborDrawer
        open={drawerUnit !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDrawerUnit(null)
        }}
        propertyId={propertyId}
        unitId={drawerUnit?.unitId ?? null}
        unitCode={drawerUnit?.unitCode ?? ''}
        holderName={drawerUnit?.holderName ?? null}
        currentBalance={drawerUnit?.balance ?? 0}
        currentMonthYear={year}
        currentMonth={month}
        canRegisterPayments={canRegisterPayments && !!activeAccount && state.hasRun}
        onPaymentRegistered={() => {
          router.refresh()
        }}
      />
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Wallet
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'warning' | 'danger' | 'success'
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-rose-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'success'
          ? 'text-emerald-700'
          : 'text-foreground'
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={`mt-2 font-serif text-xl font-bold tabular-nums leading-none ${toneClass}`}>
        {value}
      </div>
      {hint ? <div className="text-xs text-muted-foreground mt-2">{hint}</div> : null}
    </div>
  )
}
