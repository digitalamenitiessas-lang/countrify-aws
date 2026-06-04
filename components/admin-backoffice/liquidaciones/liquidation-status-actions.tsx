'use client'

import { useEffect, useState, useTransition } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { IAdminCapability, IAdminLiquidationStatus } from '@/lib/types'
import { LIQUIDATION_TRANSITIONS } from '@/lib/iadmin/liquidation-status'
import {
  changeLiquidationStatus,
  generateLiquidationRun,
  getLiquidationReopenImpact,
} from '@/app/iadmin/liquidaciones/actions'

type Props = {
  runId: string
  propertyId: string
  periodId: string
  currentStatus: IAdminLiquidationStatus
  userCapabilities: IAdminCapability[]
  // true si esta liquidación ya fue arrastrada a una posterior: no se puede
  // reabrir hasta reabrir la más reciente (orden LIFO). Ocultamos esa acción.
  isSuperseded?: boolean
}

type ReopenImpact = {
  livePaymentsCount: number
  livePaymentsTotal: number
}

export function LiquidationStatusActions({
  runId,
  propertyId,
  periodId,
  currentStatus,
  userCapabilities,
  isSuperseded = false,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<IAdminLiquidationStatus | null>(null)
  const [reopenImpact, setReopenImpact] = useState<ReopenImpact | null>(null)
  const [loadingImpact, setLoadingImpact] = useState(false)

  const caps = new Set(userCapabilities)
  const isReopen = (to: IAdminLiquidationStatus) =>
    (to === 'calculated' || to === 'draft') &&
    (currentStatus === 'issued' || currentStatus === 'closed')
  const available = LIQUIDATION_TRANSITIONS[currentStatus]
    .filter((t) => caps.has(t.requires))
    // Si ya fue superada por una liquidación posterior, no ofrecemos reabrir.
    .filter((t) => !(isSuperseded && isReopen(t.to)))
  const canRecalculate =
    (currentStatus === 'draft' || currentStatus === 'calculated') && caps.has('liquidations.create')

  const isReopenConfirming =
    confirming != null &&
    (confirming === 'calculated' || confirming === 'draft') &&
    (currentStatus === 'issued' || currentStatus === 'closed')

  useEffect(() => {
    if (!isReopenConfirming) {
      setReopenImpact(null)
      return
    }
    setLoadingImpact(true)
    getLiquidationReopenImpact(runId)
      .then((res) =>
        setReopenImpact({
          livePaymentsCount: res.livePaymentsCount,
          livePaymentsTotal: res.livePaymentsTotal,
        }),
      )
      .catch(() => setReopenImpact({ livePaymentsCount: 0, livePaymentsTotal: 0 }))
      .finally(() => setLoadingImpact(false))
  }, [isReopenConfirming, runId])

  function run(next: IAdminLiquidationStatus, acknowledgePaymentImpact = false) {
    startTransition(async () => {
      try {
        await changeLiquidationStatus({ runId, nextStatus: next, acknowledgePaymentImpact })
        toast.success('Estado actualizado')
        setConfirming(null)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo cambiar el estado')
      }
    })
  }

  function handleRecalculate() {
    startTransition(async () => {
      try {
        const result = await generateLiquidationRun({
          propertyId,
          accountingPeriodId: periodId,
        })
        toast.success(`Recalculado: ${result.totalUnits} unidades`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al recalcular')
      }
    })
  }

  if (available.length === 0 && !canRecalculate) {
    if (isSuperseded) {
      return (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Esta liquidación ya fue arrastrada a una posterior, por eso no se puede reabrir. Para
            corregirla, reabrí primero la liquidación más reciente.
          </span>
        </div>
      )
    }
    return (
      <div className="text-xs text-muted-foreground">
        Esta corrida está cerrada. No hay acciones disponibles.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {isSuperseded ? (
        <p className="text-xs text-muted-foreground">
          La reapertura no está disponible: esta liquidación ya fue arrastrada a una posterior.
          Reabrí primero la más reciente.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canRecalculate ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={handleRecalculate}>
            Recalcular desde gastos
          </Button>
        ) : null}
        {available.map((t) => {
          const isPrimary = t.to === 'issued' || t.to === 'closed'
          const variant = t.destructive ? 'destructive' : isPrimary ? 'default' : 'outline'
          return (
            <Button
              key={t.to}
              size="sm"
              variant={variant}
              disabled={pending}
              onClick={() => (t.destructive ? setConfirming(t.to) : run(t.to))}
            >
              {t.label}
            </Button>
          )
        })}
      </div>

      {confirming ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="flex-1 space-y-2 text-amber-900">
              {isReopenConfirming ? (
                <>
                  <p className="font-medium">
                    Vas a reabrir una liquidación{' '}
                    {currentStatus === 'issued' ? 'emitida' : 'cerrada'}.
                  </p>
                  {loadingImpact ? (
                    <p className="text-xs flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Buscando pagos vinculados…
                    </p>
                  ) : reopenImpact && reopenImpact.livePaymentsCount > 0 ? (
                    <div className="text-xs space-y-1">
                      <p>
                        Esta corrida tiene{' '}
                        <b>{reopenImpact.livePaymentsCount} pago(s) vigentes</b> por un total
                        de <b>${reopenImpact.livePaymentsTotal.toFixed(2)}</b>.
                      </p>
                      <p>
                        Al reabrir, los asientos del ledger se anulan y los pagos quedan
                        registrados pero <b>desvinculados</b> de esta liquidación. Vas a tener
                        que reaplicarlos a mano después de re-emitir.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs">
                      No hay pagos vinculados. Se puede reabrir sin impacto financiero.
                    </p>
                  )}
                </>
              ) : (
                <p>¿Confirmar la operación?</p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending || loadingImpact}
              onClick={() => run(confirming, isReopenConfirming)}
            >
              {pending ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Procesando…
                </>
              ) : isReopenConfirming && reopenImpact && reopenImpact.livePaymentsCount > 0 ? (
                'Reabrir igualmente'
              ) : (
                'Continuar'
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
