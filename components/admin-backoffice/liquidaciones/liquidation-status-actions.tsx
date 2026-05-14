'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { IAdminCapability, IAdminLiquidationStatus } from '@/lib/types'
import { LIQUIDATION_TRANSITIONS } from '@/lib/iadmin/liquidation-status'
import { changeLiquidationStatus, generateLiquidationRun } from '@/app/iadmin/liquidaciones/actions'

type Props = {
  runId: string
  propertyId: string
  periodId: string
  currentStatus: IAdminLiquidationStatus
  userCapabilities: IAdminCapability[]
}

export function LiquidationStatusActions({
  runId,
  propertyId,
  periodId,
  currentStatus,
  userCapabilities,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<IAdminLiquidationStatus | null>(null)

  const caps = new Set(userCapabilities)
  const available = LIQUIDATION_TRANSITIONS[currentStatus].filter((t) => caps.has(t.requires))
  const canRecalculate =
    (currentStatus === 'draft' || currentStatus === 'calculated') && caps.has('liquidations.create')

  function run(next: IAdminLiquidationStatus) {
    startTransition(async () => {
      try {
        await changeLiquidationStatus({ runId, nextStatus: next })
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
    return (
      <div className="text-xs text-muted-foreground">
        Esta corrida esta cerrada. No hay acciones disponibles.
      </div>
    )
  }

  return (
    <div className="space-y-3">
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
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
          <p className="text-amber-900">
            {confirming === 'calculated'
              ? 'Reabrir la liquidacion emitida permite recalcular pero invalida lo emitido previamente. ¿Continuar?'
              : '¿Confirmar la operacion?'}
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(confirming)}>
              Continuar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
