'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Loader2, Receipt, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { submitPaymentClaim } from '@/app/vecino/payment-claim-actions'

type Props = {
  unitId: string
  unitCode: string
  liquidationItemId: string | null
  suggestedAmount: number | null
}

export function ReportPaymentForm({ unitId, unitCode, liquidationItemId, suggestedAmount }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [amount, setAmount] = useState<string>(
    suggestedAmount && suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '',
  )
  const [paidAt, setPaidAt] = useState<string>(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState<string>('transferencia')
  const [reference, setReference] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)

  function resetForm() {
    setOpen(false)
    setSuccess(false)
    setFile(null)
    setReference('')
    setNotes('')
  }

  async function uploadFileToS3(): Promise<string | undefined> {
    if (!file) return undefined
    setUploading(true)
    try {
      const presign = await fetch('/api/uploads/payment-claim-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
        }),
      })
      if (!presign.ok) {
        const err = await presign.json().catch(() => ({}))
        throw new Error(err.error ?? 'No se pudo preparar la subida')
      }
      const { uploadUrl, objectKey } = (await presign.json()) as {
        uploadUrl: string
        objectKey: string
      }
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!putRes.ok) throw new Error('La carga del archivo falló')
      return objectKey
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amt = Number(amount.replace(',', '.'))
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Ingresá un monto válido')
      return
    }
    startTransition(async () => {
      try {
        const documentObjectKey = await uploadFileToS3()
        await submitPaymentClaim({
          unitId,
          liquidationItemId,
          amount: amt,
          paidAtClaimed: paidAt,
          method: method.trim() || undefined,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
          documentObjectKey,
        })
        setSuccess(true)
        toast.success('Pago reportado. El administrador lo va a validar.')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al reportar el pago')
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
      >
        <Receipt className="w-3.5 h-3.5" />
        Reportar pago / subir comprobante
      </button>
    )
  }

  if (success) {
    return (
      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-medium text-emerald-900 text-sm">Pago reportado</div>
            <p className="text-xs text-emerald-800 mt-1">
              El administrador del consorcio lo va a validar. Cuando confirme, vas a ver el pago
              acreditado en tu saldo.
            </p>
            <button
              type="button"
              onClick={resetForm}
              className="mt-3 text-xs underline text-emerald-900"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-border/50 bg-background p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-foreground">Reportar pago de unidad {unitCode}</div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Monto ($)</Label>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Fecha del pago</Label>
          <Input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Método</Label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="mercadopago">MercadoPago</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Referencia (opcional)</Label>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="N° operación"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Comprobante (PDF o imagen)</Label>
        <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted/50">
          <Upload className="w-3.5 h-3.5" />
          {file ? <span className="text-foreground">{file.name}</span> : <span>Elegir archivo</span>}
          <input
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Notas (opcional)</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Algo que el admin deba saber"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pending || uploading}>
          {pending || uploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              {uploading ? 'Subiendo…' : 'Enviando…'}
            </>
          ) : (
            'Enviar para validar'
          )}
        </Button>
      </div>
    </form>
  )
}
