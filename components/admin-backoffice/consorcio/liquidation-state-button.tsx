'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { LiquidationStatusActions } from '@/components/admin-backoffice/liquidaciones/liquidation-status-actions'
import type { IAdminCapability, IAdminLiquidationStatus } from '@/lib/types'

const STATUS_LABEL: Record<IAdminLiquidationStatus, string> = {
  draft: 'Borrador',
  calculated: 'Calculada',
  issued: 'Emitida',
  closed: 'Cerrada',
}

const STATUS_STYLE: Record<IAdminLiquidationStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  calculated: 'bg-sky-100 text-sky-800',
  issued: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-200 text-slate-800',
}

/**
 * Botón "Ver liquidación" para la mesa del mes. Abre un diálogo que muestra el
 * estado de la liquidación del período seleccionado y permite gestionar las
 * transiciones (Cerrar / Reabrir) reutilizando `LiquidationStatusActions`.
 *
 * Pensado para mostrarse cuando el run está `issued` o `closed`. En esos
 * estados `LiquidationStatusActions` ofrece exactamente Cerrar / Reabrir, por
 * lo que `periodId` (que solo usa el camino de recálculo desde draft/calculated)
 * queda sin usar y se pasa vacío.
 */
export function LiquidationStateButton({
  runId,
  propertyId,
  currentStatus,
  periodLabel,
  userCapabilities,
}: {
  runId: string
  propertyId: string
  currentStatus: IAdminLiquidationStatus
  periodLabel: string
  userCapabilities: IAdminCapability[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileText className="w-3.5 h-3.5 mr-1.5" />
          Ver liquidación
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>Liquidación · {periodLabel}</span>
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[currentStatus]}`}
            >
              {STATUS_LABEL[currentStatus]}
            </span>
          </DialogTitle>
          <DialogDescription>
            Gestioná el estado de la liquidación de este período.
          </DialogDescription>
        </DialogHeader>
        <LiquidationStatusActions
          runId={runId}
          propertyId={propertyId}
          periodId=""
          currentStatus={currentStatus}
          userCapabilities={userCapabilities}
        />
      </DialogContent>
    </Dialog>
  )
}
