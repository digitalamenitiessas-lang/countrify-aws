'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { IAdminCashAccountWithBalance } from '@/lib/types'
import { payExpense } from '@/app/iadmin/consorcios/[id]/cuentas/actions'

type Props = {
  expenseId: string
  alreadyPaid: boolean
  paidFromAccountName: string | null
  paidAt: string | null
  cashAccounts: Pick<IAdminCashAccountWithBalance, 'id' | 'name' | 'kind' | 'isActive' | 'currentBalance'>[]
}

export function ExpensePayAction({ expenseId, alreadyPaid, paidFromAccountName, paidAt, cashAccounts }: Props) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const activeAccounts = cashAccounts.filter((a) => a.isActive)
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? '')
  const [movDate, setMovDate] = useState(new Date().toISOString().slice(0, 10))
  const [externalRef, setExternalRef] = useState('')

  if (alreadyPaid) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center gap-2 text-sm text-emerald-900">
        <CheckCircle2 className="w-4 h-4" />
        Pagado
        {paidFromAccountName ? ` desde ${paidFromAccountName}` : ''}
        {paidAt ? ` el ${paidAt.slice(0, 10)}` : ''}
      </div>
    )
  }

  if (activeAccounts.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        No hay cuentas activas. Cargá una cuenta desde la pestaña "Cuentas" para poder registrar pagos.
      </div>
    )
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accountId) {
      toast.error('Seleccioná una cuenta')
      return
    }
    startTransition(async () => {
      try {
        await payExpense({
          expenseId,
          cashAccountId: accountId,
          movementDate: movDate,
          externalRef: externalRef.trim() || undefined,
        })
        toast.success('Pago registrado')
        setOpen(false)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al registrar pago')
      }
    })
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Wallet className="w-3.5 h-3.5 mr-1.5" />
        Registrar pago
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Registrar pago a proveedor</h4>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Cuenta</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · saldo {a.currentBalance.toLocaleString('es-AR')}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Fecha de pago</Label>
          <Input type="date" value={movDate} onChange={(e) => setMovDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Ref. (opcional)</Label>
          <Input value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="Nº de operación bancaria" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Registrando…' : 'Confirmar pago'}
        </Button>
      </div>
    </form>
  )
}
