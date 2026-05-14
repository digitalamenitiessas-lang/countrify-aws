'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { voidCollection } from '@/app/iadmin/cobranzas/actions'

export function VoidPaymentButton({
  paymentId,
  canVoid,
}: {
  paymentId: string
  canVoid: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  if (!canVoid) return null

  function submit() {
    if (!reason.trim()) {
      toast.error('Motivo obligatorio')
      return
    }
    startTransition(async () => {
      try {
        await voidCollection({ paymentId, reason: reason.trim() })
        toast.success('Pago anulado')
        setOpen(false)
        setReason('')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="text-rose-700 hover:text-rose-900">
        Anular
      </Button>
    )
  }

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-rose-900">Anular pago</h4>
        <button type="button" className="text-xs text-muted-foreground" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <div className="space-y-1.5">
        <Label className="text-rose-900">Motivo</Label>
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="destructive" disabled={pending} onClick={submit}>
          {pending ? 'Anulando…' : 'Confirmar'}
        </Button>
      </div>
    </div>
  )
}
