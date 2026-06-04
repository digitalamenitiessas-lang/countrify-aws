'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Money } from '@/components/admin-backoffice/shared/money'
import { VoidPaymentButton } from '@/components/admin-backoffice/cobranzas/void-payment-button'
import type { IAdminCollectionPayment } from '@/lib/types'

interface Props {
  payment: IAdminCollectionPayment | null
  canVoid: boolean
  onClose: () => void
}

const MONTH_LABELS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function PaymentDetailDrawer({ payment, canVoid, onClose }: Props) {
  const router = useRouter()

  // Esc para cerrar
  useEffect(() => {
    if (!payment) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [payment, onClose])

  // Si despues de anular, el server action ya hizo revalidatePath. Cuando
  // recibimos un payment con isVoid=true nuevo, refrescamos por las dudas.
  useEffect(() => {
    if (payment?.isVoid) {
      router.refresh()
    }
  }, [payment?.isVoid, router])

  if (!payment) return null

  const periodLabel =
    payment.periodYear && payment.periodMonth
      ? `${MONTH_LABELS[payment.periodMonth - 1] ?? `mes ${payment.periodMonth}`} ${payment.periodYear}`
      : '—'
  const propertyName = payment.propertyDisplayName ?? payment.buildingName ?? '—'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-md bg-background border-l border-border shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/60 bg-background/95 backdrop-blur px-5 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-primary font-medium">
              Recibo {payment.receiptNumber ?? '—'}
            </div>
            <h2 className="font-serif text-lg font-bold text-foreground mt-0.5">
              Detalle de cobranza
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {payment.isVoid ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-500/5 dark:border-rose-400/30 px-3 py-2">
              <div className="text-xs font-semibold text-rose-900 dark:text-rose-300 uppercase tracking-wider">
                Anulado
              </div>
              {payment.voidReason ? (
                <div className="mt-1 text-sm text-rose-900 dark:text-rose-200">
                  Motivo: {payment.voidReason}
                </div>
              ) : null}
              {payment.voidedByName || payment.voidedAt ? (
                <div className="mt-1 text-xs text-rose-800/80 dark:text-rose-200/70">
                  {payment.voidedByName ? `Por ${payment.voidedByName}` : ''}
                  {payment.voidedAt
                    ? ` · ${new Date(payment.voidedAt).toLocaleString('es-AR')}`
                    : ''}
                </div>
              ) : null}
            </div>
          ) : null}

          <Section title="Monto">
            <div className="text-2xl font-semibold text-foreground">
              <Money amount={payment.amount} />
            </div>
            {payment.surchargeAmount > 0 ? (
              <div className="text-xs text-muted-foreground mt-0.5">
                Recargo incluido: <Money amount={payment.surchargeAmount} />
              </div>
            ) : null}
          </Section>

          <Section title="Liquidación">
            <Field label="Período" value={periodLabel} />
            <Field label="Consorcio" value={propertyName} />
            <Field label="Unidad" value={payment.unitCode ?? '—'} />
            <Field label="Vecino" value={payment.holderName ?? '—'} />
            {payment.dueLabel ? <Field label="Vencimiento pagado" value={payment.dueLabel} /> : null}
          </Section>

          <Section title="Cobro">
            <Field label="Fecha de pago" value={payment.paidAt} />
            <Field label="Cuenta" value={payment.cashAccountName ?? '—'} />
            <Field label="Método" value={payment.method ?? '—'} />
            {payment.reference ? <Field label="Referencia externa" value={payment.reference} /> : null}
          </Section>

          {payment.notes ? (
            <Section title="Notas">
              <p className="text-sm text-foreground whitespace-pre-line">{payment.notes}</p>
            </Section>
          ) : null}

          <Section title="Auditoría">
            <Field
              label="Creado"
              value={
                payment.createdByName
                  ? `${payment.createdByName} · ${new Date(payment.createdAt).toLocaleString('es-AR')}`
                  : new Date(payment.createdAt).toLocaleString('es-AR')
              }
            />
          </Section>

          {!payment.isVoid && canVoid ? (
            <div className="pt-2 border-t border-border/40">
              <VoidPaymentButton paymentId={payment.id} canVoid={canVoid} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium text-right">{value}</span>
    </div>
  )
}
