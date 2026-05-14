'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, HandCoins, Loader2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/admin-backoffice/shared/money'
import { NeighborDrawer } from '@/components/admin-backoffice/consorcio/neighbor-drawer'
import { EmptyState } from '@/components/admin-backoffice/shared/empty-state'
import type { IAdminCashAccountWithBalance, IAdminMesaState, IAdminMesaUnitLine } from '@/lib/types'

type Props = {
  state: IAdminMesaState
  cashAccounts: IAdminCashAccountWithBalance[]
  onPayQuick: (itemIdLookup: { unitId: string; amount: number }) => Promise<void>
  canRegister: boolean
  propertyId: string
  currentMonthYear: number
  currentMonth: number
}

type Filter = 'all' | 'pending' | 'paid'

export function MesaPayments({
  state,
  cashAccounts,
  onPayQuick,
  canRegister,
  propertyId,
  currentMonthYear,
  currentMonth,
}: Props) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [pending, startTransition] = useTransition()
  const [drawerUnit, setDrawerUnit] = useState<IAdminMesaUnitLine | null>(null)

  const activeAccount = cashAccounts.find((a) => a.isActive)

  // Escuchar evento mesa:open-unit para abrir drawer desde command palette
  useEffect(() => {
    function onOpenUnit(e: Event) {
      const detail = (e as CustomEvent<{ unitId: string }>).detail
      if (!detail?.unitId) return
      const unit = state.units.find((u) => u.unitId === detail.unitId)
      if (unit) {
        setDrawerUnit(unit)
        setOpen(true)
      }
    }
    window.addEventListener('mesa:open-unit', onOpenUnit)
    return () => window.removeEventListener('mesa:open-unit', onOpenUnit)
  }, [state.units])

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

  function handleQuickPay(unitId: string, amount: number) {
    startTransition(async () => {
      try {
        await onPayQuick({ unitId, amount })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al registrar pago')
      }
    })
  }

  return (
    <>
      <section className="mesa-card overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
          aria-expanded={open}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl kpi-icon-disc flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
            <div className="text-left">
              <h3 className="font-serif text-lg font-semibold text-foreground">Control de pagos</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {state.collectionRatePct !== null
                  ? `Cobrado ${state.collectionRatePct}% · $ ${state.totalCollected.toLocaleString('es-AR')} / $ ${(state.totalToDistribute + state.previousBalanceTotal).toLocaleString('es-AR')}`
                  : 'Sin liquidación para cobrar todavía'}
              </p>
            </div>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {open && !state.hasRun ? (
          <>
            <div className="divider-soft" />
            <EmptyState
              icon={HandCoins}
              title="Todavía no emitiste la liquidación"
              description="Cargá los gastos del mes y emitila. Ahí empezás a ver quién pagó, quién debe y a registrar cobros con un click."
              compact
            />
          </>
        ) : null}

        {open && state.hasRun ? (
          <>
            <div className="divider-soft" />
            <div className="px-6 py-3 flex items-center gap-2 flex-wrap">
              {(['all', 'pending', 'paid'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs transition-all ${
                    filter === f
                      ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {f === 'all' ? `Todos (${state.units.length})` : f === 'pending' ? `Con saldo (${state.units.filter((u) => u.balance > 0.01).length})` : `Al día (${state.units.filter((u) => u.subtotal > 0 && u.balance < 0.01).length})`}
                </button>
              ))}
              <div className="flex-1" />
              {canRegister && !activeAccount ? (
                <span className="text-xs text-amber-700">Configurá una cuenta bancaria para registrar pagos</span>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] border-b border-border/40 bg-muted/20">
                    <th className="text-left px-4 py-2 font-medium">Unidad</th>
                    <th className="text-left px-4 py-2 font-medium">Titular</th>
                    <th className="text-right px-4 py-2 font-medium">Total</th>
                    <th className="text-right px-4 py-2 font-medium">Cobrado</th>
                    <th className="text-right px-4 py-2 font-medium">Saldo</th>
                    {canRegister ? <th className="px-2 py-2" /> : null}
                    <th className="px-2 py-2" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Sin unidades para mostrar en este filtro.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => {
                      const isPaid = u.subtotal > 0 && u.balance < 0.01
                      return (
                        <tr
                          key={u.unitId}
                          className="border-b border-border/20 last:border-0 planilla-row cursor-pointer transition-colors"
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
                          <td className="px-4 py-1.5 font-medium text-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              {u.unitCode}
                              {isPaid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : null}
                            </span>
                          </td>
                          <td className="px-4 py-1.5 text-muted-foreground">
                            {u.holderName ?? <span className="italic">—</span>}
                          </td>
                          <td className="px-4 py-1.5 text-right tabular-nums">
                            {u.subtotal > 0 ? u.subtotal.toLocaleString('es-AR') : '—'}
                          </td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-emerald-700">
                            {u.collected > 0 ? u.collected.toLocaleString('es-AR') : '—'}
                          </td>
                          <td className={`px-4 py-1.5 text-right tabular-nums ${u.balance > 0 ? 'text-rose-700 font-medium' : 'text-muted-foreground'}`}>
                            {u.balance > 0 ? u.balance.toLocaleString('es-AR') : '✓'}
                          </td>
                          {canRegister ? (
                            <td className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
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
                          <td className="px-2 py-1.5 text-right w-6">
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 font-medium">
                    <td colSpan={2} className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <Money amount={state.totalToDistribute + state.previousBalanceTotal} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-700">
                      <Money amount={state.totalCollected} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-rose-700">
                      <Money amount={state.totalPending} />
                    </td>
                    {canRegister ? <td /> : null}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="px-6 py-2 text-[10px] text-muted-foreground/80 italic border-t border-border/20">
              Tip: hacé clic en cualquier unidad para ver su estado de cuenta completo.
            </p>
          </>
        ) : null}

      </section>

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
        currentMonthYear={currentMonthYear}
        currentMonth={currentMonth}
        canRegisterPayments={canRegister && !!activeAccount && state.hasRun}
        onPaymentRegistered={() => {
          // Dejar abierto el drawer para ver el nuevo recibo pero refrescar la página
          // al cerrar para reflejar el cambio en la tabla
        }}
      />
    </>
  )
}
