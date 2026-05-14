'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, Share2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createLiquidationItemShareToken } from '@/app/iadmin/liquidaciones/share-actions'

type Props = {
  itemId: string
  unitCode: string
  holderName: string | null
  holderPhone?: string | null
  amountPaid: number
  receiptNumber: string
  periodLabel: string
  onClose: () => void
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function PaymentConfirmationDialog({
  itemId,
  unitCode,
  holderName,
  holderPhone,
  amountPaid,
  receiptNumber,
  periodLabel,
  onClose,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [url, setUrl] = useState<string | null>(null)

  const who = holderName ?? unitCode
  const baseMessage = `Hola ${who}! Recibimos tu pago de ${formatARS(amountPaid)} correspondiente a las expensas de ${periodLabel}. Recibo Nº ${receiptNumber}. Gracias!`

  function buildMessage(): string {
    if (url) {
      return `${baseMessage}\nPodés ver tu liquidacion acá: ${url}`
    }
    return baseMessage
  }

  function handleGenerate() {
    startTransition(async () => {
      try {
        const { url: generated } = await createLiquidationItemShareToken({ liquidationItemId: itemId })
        const absolute = generated.startsWith('http') ? generated : `${window.location.origin}${generated}`
        setUrl(absolute)
        toast.success('Link agregado al mensaje')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al generar link')
      }
    })
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildMessage())
      toast.success('Mensaje copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  function whatsappHref() {
    const phone = (holderPhone ?? '').replace(/[^\d+]/g, '')
    const base = phone ? `https://wa.me/${phone.startsWith('+') ? phone.slice(1) : phone}` : 'https://wa.me'
    return `${base}?text=${encodeURIComponent(buildMessage())}`
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-background shadow-xl">
        <header className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">¡Pago registrado!</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recibo Nº {receiptNumber} · {formatARS(amountPaid)}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <div className="rounded-lg bg-muted/40 p-3 text-sm whitespace-pre-line">
            {buildMessage()}
          </div>

          {!url ? (
            <div className="flex items-center justify-center">
              <Button size="sm" variant="outline" disabled={pending} onClick={handleGenerate}>
                {pending ? 'Generando…' : 'Agregar link a la liquidación'}
              </Button>
            </div>
          ) : (
            <div className="text-xs text-emerald-700 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Link incluido en el mensaje
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end pt-2">
            <Button size="sm" variant="outline" onClick={handleCopy}>
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              Copiar texto
            </Button>
            <a
              href={whatsappHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-700"
            >
              <Share2 className="w-3.5 h-3.5" />
              Enviar por WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
