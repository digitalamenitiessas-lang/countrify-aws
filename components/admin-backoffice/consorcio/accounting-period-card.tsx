'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, FileSpreadsheet, Lock, LockOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { IAdminAccountingPeriod, IAdminCapability } from '@/lib/types'
import { changePeriodStatus, openAccountingPeriod } from '@/app/iadmin/consorcios/[id]/actions'
import { generateLiquidationRun } from '@/app/iadmin/liquidaciones/actions'

type Props = {
  propertyId: string
  period: IAdminAccountingPeriod | null
  userCapabilities: IAdminCapability[]
}

const STATUS_LABELS: Record<'open' | 'locked' | 'closed', string> = {
  open: 'Abierto',
  locked: 'Bloqueado',
  closed: 'Cerrado',
}

const STATUS_TONE: Record<'open' | 'locked' | 'closed', string> = {
  open: 'bg-emerald-100 text-emerald-800',
  locked: 'bg-amber-100 text-amber-800',
  closed: 'bg-muted text-muted-foreground',
}

export function AccountingPeriodCard({ propertyId, period, userCapabilities }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const caps = new Set(userCapabilities)
  const canOpen = caps.has('liquidations.create')
  const canClose = caps.has('liquidations.close')

  function handleGenerateLiquidation() {
    if (!period) return
    startTransition(async () => {
      try {
        const result = await generateLiquidationRun({
          propertyId,
          accountingPeriodId: period.id,
        })
        toast.success(`Liquidacion calculada: ${result.totalUnits} unidades`)
        router.push(`/iadmin/liquidaciones/${result.id}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo generar')
      }
    })
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  function handleOpenCurrentPeriod() {
    startTransition(async () => {
      try {
        await openAccountingPeriod({ propertyId, periodYear: year, periodMonth: month })
        toast.success('Periodo abierto')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function handleChangeStatus(next: 'open' | 'locked' | 'closed') {
    if (!period) return
    startTransition(async () => {
      try {
        await changePeriodStatus({ periodId: period.id, nextStatus: next })
        toast.success('Periodo actualizado')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
            <CalendarClock className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Periodo actual</div>
            {period ? (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-medium text-foreground tabular-nums">
                  {String(period.periodMonth).padStart(2, '0')}/{period.periodYear}
                </span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[period.status]}`}>
                  {STATUS_LABELS[period.status]}
                </span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground mt-0.5">Sin periodo abierto para el mes en curso</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          {!period ? (
            canOpen ? (
              <Button size="sm" onClick={handleOpenCurrentPeriod} disabled={pending}>
                <LockOpen className="w-3.5 h-3.5 mr-1.5" />
                Abrir periodo {String(month).padStart(2, '0')}/{year}
              </Button>
            ) : null
          ) : (
            <>
              {period.status === 'open' && canOpen ? (
                <Button size="sm" variant="outline" onClick={() => handleChangeStatus('locked')} disabled={pending}>
                  <Lock className="w-3.5 h-3.5 mr-1.5" />
                  Bloquear (previo al cierre)
                </Button>
              ) : null}
              {period.status === 'locked' && canOpen ? (
                <Button size="sm" variant="outline" onClick={() => handleChangeStatus('open')} disabled={pending}>
                  Reabrir
                </Button>
              ) : null}
              {period.status !== 'closed' && canClose ? (
                <Button size="sm" onClick={() => handleChangeStatus('closed')} disabled={pending}>
                  Cerrar periodo
                </Button>
              ) : null}
              {period.status === 'closed' && canOpen ? (
                <Button size="sm" variant="outline" onClick={() => handleChangeStatus('open')} disabled={pending}>
                  Reabrir
                </Button>
              ) : null}
              {canOpen ? (
                <Button size="sm" variant="default" onClick={handleGenerateLiquidation} disabled={pending}>
                  <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
                  Generar liquidacion
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {period?.closedAt ? (
        <div className="text-xs text-muted-foreground mt-3">
          Cerrado: {period.closedAt.slice(0, 16).replace('T', ' ')}
        </div>
      ) : null}
    </div>
  )
}
