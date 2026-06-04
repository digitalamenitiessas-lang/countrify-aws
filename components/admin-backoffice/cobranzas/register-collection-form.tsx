'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Money } from '@/components/admin-backoffice/shared/money'
import type { IAdminCashAccountWithBalance, IAdminDueDate } from '@/lib/types'
import { registerCollection } from '@/app/iadmin/cobranzas/actions'

type Props = {
  itemId: string
  unitCode: string
  holderName: string | null
  subtotal: number
  balanceRemaining: number
  dueDates: IAdminDueDate[]
  cashAccounts: Pick<IAdminCashAccountWithBalance, 'id' | 'name' | 'isActive' | 'currentBalance'>[]
  onDone?: () => void
}

export function RegisterCollectionForm({
  itemId,
  unitCode,
  holderName,
  subtotal,
  balanceRemaining,
  dueDates,
  cashAccounts,
  onDone,
}: Props) {
  const [pending, startTransition] = useTransition()
  const activeAccounts = cashAccounts.filter((a) => a.isActive)
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? '')
  const [amount, setAmount] = useState(balanceRemaining.toFixed(2))
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [dueLabel, setDueLabel] = useState<string>(dueDates[0]?.label ?? '')
  const [reference, setReference] = useState('')
  const [method, setMethod] = useState('transferencia')
  const [notes, setNotes] = useState('')

  if (activeAccounts.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        No hay cuentas activas. Cargá una cuenta en "Cuentas" para poder registrar cobranzas.
      </div>
    )
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amt = Number(amount.replace(',', '.'))
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Monto invalido')
      return
    }
    startTransition(async () => {
      try {
        const { receiptNumber } = await registerCollection({
          liquidationItemId: itemId,
          cashAccountId: accountId,
          amount: amt,
          paidAt,
          dueLabel: dueLabel || undefined,
          method: method || undefined,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        })
        toast.success(`Cobranza registrada · Recibo ${receiptNumber}`)
        onDone?.()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al registrar')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="font-medium text-sm text-foreground">
            Registrar cobranza · {unitCode}
            {holderName ? <span className="text-muted-foreground font-normal"> · {holderName}</span> : null}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Total liquidado: <Money amount={subtotal} /> · Saldo pendiente: <Money amount={balanceRemaining} />
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Cuenta *</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currentBalance.toLocaleString('es-AR')}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Fecha de pago *</Label>
          <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Monto *</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        {dueDates.length > 0 ? (
          <div className="space-y-1.5">
            <Label>Vencimiento pagado</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={dueLabel}
              onChange={(e) => setDueLabel(e.target.value)}
            >
              <option value="">— Sin especificar —</option>
              {dueDates.map((d) => (
                <option key={d.label} value={d.label}>
                  {d.label} · {d.date}
                  {d.surchargePct > 0 ? ` (+${d.surchargePct}%)` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label>Metodo</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="cheque">Cheque</option>
            <option value="deposito">Deposito</option>
            <option value="debin">Debin</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Referencia externa</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nº operación bancaria" />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label>Notas</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Registrando…' : 'Registrar cobranza'}
        </Button>
      </div>
    </form>
  )
}
