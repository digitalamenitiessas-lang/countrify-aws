'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageCircle,
  Receipt,
  UserCircle2,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { AnimatedNumber } from '@/components/admin-backoffice/shared/animated-number'
import {
  getUnitStatement,
  quickPayFromMesa,
} from '@/app/iadmin/consorcios/[id]/planilla/actions'
import type { IAdminUnitAccountMonth, IAdminUnitAccountStatement } from '@/lib/types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  propertyId: string
  unitId: string | null
  unitCode: string
  holderName: string | null
  currentBalance: number
  currentMonthYear: number
  currentMonth: number
  canRegisterPayments: boolean
  onPaymentRegistered?: () => void
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function NeighborDrawer({
  open,
  onOpenChange,
  propertyId,
  unitId,
  unitCode,
  holderName,
  currentBalance,
  currentMonthYear,
  currentMonth,
  canRegisterPayments,
  onPaymentRegistered,
}: Props) {
  const [statement, setStatement] = useState<IAdminUnitAccountStatement | null>(null)
  const [loading, setLoading] = useState(false)
  const [paying, startPaying] = useTransition()

  useEffect(() => {
    if (!open || !unitId) {
      setStatement(null)
      return
    }
    let alive = true
    setLoading(true)
    getUnitStatement({ propertyId, unitId, monthsCount: 12 })
      .then((s) => {
        if (alive) setStatement(s)
      })
      .catch((err) => {
        if (!alive) return
        toast.error(err instanceof Error ? err.message : 'Error al cargar estado de cuenta')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, propertyId, unitId])

  function handleQuickPay() {
    if (!unitId || currentBalance <= 0.01) return
    startPaying(async () => {
      try {
        const result = await quickPayFromMesa({
          propertyId,
          year: currentMonthYear,
          month: currentMonth,
          unitId,
          amount: currentBalance,
        })
        toast.success(`Pago registrado · Recibo ${result.receiptNumber}`)
        onPaymentRegistered?.()
        // Refrescar el statement para mostrar el nuevo recibo
        const refreshed = await getUnitStatement({ propertyId, unitId, monthsCount: 12 })
        setStatement(refreshed)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al registrar pago')
      }
    })
  }

  function handleSendReminder() {
    if (!statement?.unit.holderPhone) {
      toast.error('El titular no tiene teléfono cargado')
      return
    }
    const phone = statement.unit.holderPhone.replace(/\D/g, '')
    const msg = encodeURIComponent(
      `Hola${statement.unit.holderName ? ` ${statement.unit.holderName}` : ''}, te escribo de la administración. Quedás con un saldo pendiente de $ ${formatARS(statement.totals.pending)} en la unidad ${unitCode}. Cualquier consulta estoy a disposición.`,
    )
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="!max-w-none !w-full sm:!w-[520px] flex flex-col overflow-hidden">
        <DrawerTitle className="sr-only">
          Estado de cuenta · Unidad {unitCode}
        </DrawerTitle>

        <header className="relative px-6 pt-6 pb-4 border-b border-border/30 bg-gradient-to-b from-primary/5 to-transparent">
          <DrawerClose asChild>
            <button
              type="button"
              className="absolute top-4 right-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </DrawerClose>

          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Estado de cuenta
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <h2 className="font-serif text-2xl font-bold text-foreground">Unidad {unitCode}</h2>
            {statement?.unit ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {(statement.unit.prorataCoefficient * 100).toFixed(4)}%
              </span>
            ) : null}
          </div>

          {statement?.unit.holderName || holderName ? (
            <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <UserCircle2 className="w-3.5 h-3.5" />
              <span>{statement?.unit.holderName ?? holderName}</span>
              {statement?.unit.holderPhone ? (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span>{statement.unit.holderPhone}</span>
                </>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground italic">Sin titular cargado</p>
          )}

          {statement ? (
            <div className="mt-4 grid grid-cols-3 gap-1 text-[11px]">
              <TotalPill
                label="Facturado 12m"
                value={`$ ${formatARS(statement.totals.billed)}`}
                tone="muted"
              />
              <TotalPill
                label="Cobrado"
                value={`$ ${formatARS(statement.totals.collected)}`}
                tone="success"
                extra={statement.totals.collectionRatePct !== null ? `${statement.totals.collectionRatePct}%` : undefined}
              />
              <TotalPill
                label="Saldo"
                value={`$ ${formatARS(statement.totals.pending)}`}
                tone={statement.totals.pending > 0 ? 'warning' : 'muted'}
              />
            </div>
          ) : null}
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Cargando estado de cuenta…
            </div>
          ) : !statement ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Sin datos
            </div>
          ) : (
            <div className="px-6 py-4 space-y-6">
              {/* Evolución mensual */}
              <section>
                <header className="flex items-center justify-between mb-2">
                  <h3 className="font-serif text-sm font-semibold text-foreground">Por mes</h3>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
                    últimos 12 meses
                  </span>
                </header>
                <div className="space-y-1.5">
                  {statement.months.map((m) => (
                    <MonthRow key={`${m.year}-${m.month}`} month={m} />
                  ))}
                </div>
              </section>

              {/* Recibos */}
              <section>
                <header className="flex items-center justify-between mb-2">
                  <h3 className="font-serif text-sm font-semibold text-foreground">Recibos</h3>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
                    {statement.payments.length}{' '}
                    {statement.payments.length === 1 ? 'recibo' : 'recibos'}
                  </span>
                </header>
                {statement.payments.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4 text-center">
                    Sin pagos registrados en los últimos 12 meses.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {statement.payments.map((p) => (
                      <li
                        key={p.id}
                        className={`rounded-lg border border-border/40 p-3 flex items-start gap-3 ${
                          p.isVoid ? 'opacity-60' : 'bg-background'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg kpi-icon-disc flex items-center justify-center shrink-0">
                          <Receipt className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-foreground tabular-nums">
                              {p.receiptNumber ?? 'sin número'}
                            </span>
                            <span className="text-sm tabular-nums font-semibold text-emerald-700">
                              $ {formatARS(p.amount)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                            <span>{formatDateTime(p.paidAt)}</span>
                            {p.periodLabel ? (
                              <>
                                <span className="text-muted-foreground/40">·</span>
                                <span>imputado a {p.periodLabel}</span>
                              </>
                            ) : null}
                            {p.method ? (
                              <>
                                <span className="text-muted-foreground/40">·</span>
                                <span>{p.method}</span>
                              </>
                            ) : null}
                            {p.isVoid ? (
                              <span className="ml-1 inline-flex rounded-full bg-rose-50 text-rose-800 border border-rose-200 px-1.5 py-0 text-[9px] font-medium">
                                ANULADO
                              </span>
                            ) : null}
                          </div>
                          {p.notes ? (
                            <p className="text-[11px] text-muted-foreground mt-1 italic">{p.notes}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>

        {statement && !loading ? (
          <footer className="border-t border-border/30 px-6 py-3 bg-muted/10 flex items-center gap-2 flex-wrap">
            {canRegisterPayments && currentBalance > 0.01 ? (
              <Button size="sm" onClick={handleQuickPay} disabled={paying}>
                {paying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Registrando…
                  </>
                ) : (
                  <>
                    <Wallet className="w-3.5 h-3.5 mr-1.5" />
                    Registrar pago · $ {formatARS(currentBalance)}
                  </>
                )}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={handleSendReminder} disabled={!statement.unit.holderPhone}>
              <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
              Recordar por WhatsApp
            </Button>
            {statement.months[statement.months.length - 1]?.runId ? (
              <a
                href={`/iadmin/liquidaciones/${statement.months[statement.months.length - 1].runId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors ml-auto"
              >
                Ver liquidación
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : null}
          </footer>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}

function TotalPill({
  label,
  value,
  tone,
  extra,
}: {
  label: string
  value: string
  tone: 'success' | 'warning' | 'muted'
  extra?: string
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : tone === 'warning'
        ? 'bg-amber-50 border-amber-200 text-amber-900'
        : 'bg-muted/40 border-border/40 text-foreground'
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${toneClass}`}>
      <p className="text-[9px] uppercase tracking-[0.12em] font-medium opacity-80">{label}</p>
      <p className="stat-value font-serif text-[14px] font-semibold tabular-nums leading-tight mt-0.5">
        <AnimatedNumber value={Number(value.replace(/\D/g, '')) || 0} format={() => value} />
      </p>
      {extra ? <p className="text-[10px] opacity-80">{extra}</p> : null}
    </div>
  )
}

function MonthRow({ month }: { month: IAdminUnitAccountMonth }) {
  const hasData = month.subtotal > 0
  const ratio = month.subtotal > 0 ? Math.min(1, month.collected / month.subtotal) : 0
  const pct = Math.round(ratio * 100)
  const fullyPaid = hasData && month.balance < 0.01
  const overdue = hasData && month.balance > 0.01 && !month.isCurrent

  const stateChip = !hasData
    ? null
    : fullyPaid
      ? { label: 'al día', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
      : overdue
        ? { label: 'con saldo', tone: 'bg-rose-50 text-rose-800 border-rose-200' }
        : { label: 'pendiente', tone: 'bg-amber-50 text-amber-800 border-amber-200' }

  return (
    <div
      className={`rounded-lg border px-3 py-2 transition-colors ${
        month.isCurrent
          ? 'border-primary/30 bg-primary/5'
          : hasData
            ? 'border-border/40 bg-background'
            : 'border-border/20 bg-muted/10'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] uppercase tracking-[0.08em] font-medium text-foreground tabular-nums">
            {month.label}
          </span>
          {month.isCurrent ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[9px] px-1.5 py-0 border border-primary/20">
              <span className="live-dot w-1.5 h-1.5 inline-block" aria-hidden />
              actual
            </span>
          ) : null}
          {stateChip ? (
            <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[9px] font-medium ${stateChip.tone}`}>
              {fullyPaid ? <CheckCircle2 className="w-2.5 h-2.5" /> : overdue ? <AlertTriangle className="w-2.5 h-2.5" /> : null}
              {stateChip.label}
            </span>
          ) : null}
        </div>
        {hasData ? (
          <span className="text-xs font-medium tabular-nums text-foreground">
            $ {formatARS(month.subtotal)}
          </span>
        ) : (
          <span className="text-xs italic text-muted-foreground">sin facturar</span>
        )}
      </div>

      {hasData ? (
        <>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                fullyPaid ? 'bg-emerald-500' : 'bg-primary'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
            <span>cobrado $ {formatARS(month.collected)}</span>
            <span>
              saldo{' '}
              <span className={month.balance > 0 ? 'text-rose-700 font-medium' : 'text-muted-foreground'}>
                $ {formatARS(month.balance)}
              </span>
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}
