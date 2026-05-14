'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { IAdminCashAccountWithBalance } from '@/lib/types'
import { registerCollection } from '@/app/iadmin/cobranzas/actions'
import { PaymentConfirmationDialog } from '@/components/admin-backoffice/cobranzas/payment-confirmation-dialog'

type Props = {
  itemId: string
  unitCode: string
  holderName: string | null
  holderPhone?: string | null
  periodLabel: string
  balanceRemaining: number
  canShare: boolean
  defaultAccount: Pick<IAdminCashAccountWithBalance, 'id' | 'name'> | null
  onEditClick?: () => void
}

export function QuickPayButton({
  itemId,
  unitCode,
  holderName,
  holderPhone,
  periodLabel,
  balanceRemaining,
  canShare,
  defaultAccount,
  onEditClick,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [confirmation, setConfirmation] = useState<{ receipt: string; amount: number } | null>(null)

  if (!defaultAccount) {
    return (
      <div className="text-[10px] text-amber-700 whitespace-nowrap">
        Sin cuenta activa
      </div>
    )
  }

  function handleQuickPay() {
    if (!defaultAccount) return
    startTransition(async () => {
      try {
        const { receiptNumber } = await registerCollection({
          liquidationItemId: itemId,
          cashAccountId: defaultAccount.id,
          amount: balanceRemaining,
          paidAt: new Date().toISOString().slice(0, 10),
          method: 'transferencia',
        })
        setConfirmation({ receipt: receiptNumber, amount: balanceRemaining })
        toast.success(`Pago registrado · Recibo ${receiptNumber}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al registrar')
      }
    })
  }

  return (
    <>
      <div className="flex gap-1 whitespace-nowrap">
        <Button
          size="sm"
          variant="default"
          disabled={pending}
          onClick={handleQuickPay}
          title={`Marcar pagado · ${defaultAccount.name}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
          Pagó
        </Button>
        {onEditClick ? (
          <Button size="sm" variant="ghost" onClick={onEditClick} title="Editar detalles del pago">
            …
          </Button>
        ) : null}
      </div>

      {confirmation && canShare ? (
        <PaymentConfirmationDialog
          itemId={itemId}
          unitCode={unitCode}
          holderName={holderName}
          holderPhone={holderPhone}
          amountPaid={confirmation.amount}
          receiptNumber={confirmation.receipt}
          periodLabel={periodLabel}
          onClose={() => setConfirmation(null)}
        />
      ) : null}
    </>
  )
}
