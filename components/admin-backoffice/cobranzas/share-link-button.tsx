'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, Link2, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createLiquidationItemShareToken } from '@/app/iadmin/liquidaciones/share-actions'

type Props = {
  itemId: string
  unitCode: string
  holderName: string | null
  holderPhone?: string | null
  amountToPay: number
  periodLabel: string
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function ShareLinkButton({ itemId, unitCode, holderName, holderPhone, amountToPay, periodLabel }: Props) {
  const [pending, startTransition] = useTransition()
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function handleGenerate() {
    startTransition(async () => {
      try {
        const { url } = await createLiquidationItemShareToken({ liquidationItemId: itemId })
        const absolute = url.startsWith('http') ? url : `${window.location.origin}${url}`
        setUrl(absolute)
        toast.success('Link generado')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al generar link')
      }
    })
  }

  async function copyLink() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copiado')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  function whatsappHref() {
    if (!url) return '#'
    const who = holderName ?? unitCode
    const msg = `Hola ${who}! Te comparto la liquidacion de ${periodLabel} (unidad ${unitCode}). A pagar: ${formatARS(amountToPay)}. Link: ${url}`
    const phone = (holderPhone ?? '').replace(/[^\d+]/g, '')
    const base = phone ? `https://wa.me/${phone.startsWith('+') ? phone.slice(1) : phone}` : 'https://wa.me'
    return `${base}?text=${encodeURIComponent(msg)}`
  }

  if (!url) {
    return (
      <Button size="sm" variant="ghost" disabled={pending} onClick={handleGenerate}>
        <Share2 className="w-3.5 h-3.5 mr-1" />
        Compartir
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <a
        href={whatsappHref()}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-2 py-1 text-xs hover:bg-emerald-700"
        title="Enviar por WhatsApp"
      >
        <Share2 className="w-3 h-3" />
        WhatsApp
      </a>
      <Button size="sm" variant="outline" onClick={copyLink}>
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
        title="Abrir link"
      >
        <Link2 className="w-3 h-3" />
      </a>
    </div>
  )
}
