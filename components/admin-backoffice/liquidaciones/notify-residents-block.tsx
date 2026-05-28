'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Copy, Mail, MessageCircle, Printer, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import type { IAdminLiquidationStatus } from '@/lib/types'

type Props = {
  runId: string
  status: IAdminLiquidationStatus
  propertyName: string
  monthLabel: string
  periodYear: number
  firstDueDate?: string | null
  totalUnits: number
  itemsWithBalanceCount: number
}

/**
 * Bloque post-emisión: ayuda al admin a notificar a los vecinos usando los canales que ya
 * existen en el sistema (PDF imprimible, link público por item, comunicado in-app).
 * No introduce features nuevas: solo conecta y guía.
 */
export function NotifyResidentsBlock({
  runId,
  status,
  propertyName,
  monthLabel,
  periodYear,
  firstDueDate,
  totalUnits,
  itemsWithBalanceCount,
}: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  // Si la liquidación no fue emitida todavía, no mostramos este bloque.
  if (status === 'draft' || status === 'calculated') return null

  const periodPretty = `${monthLabel.charAt(0)}${monthLabel.slice(1).toLowerCase()} ${periodYear}`
  const whatsappMessage =
    `Hola vecino/a, ya está disponible la liquidación de expensas de ${propertyName} ` +
    `correspondiente a ${periodPretty}.` +
    (firstDueDate ? ` Primer vencimiento: ${firstDueDate}.` : '') +
    ` Podés verla y descargarla desde la app. Saludos, la administración.`

  function handleCopy(label: string, text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(label)
        toast.success(`${label} copiado al portapapeles`)
        setTimeout(() => setCopied(null), 1500)
      })
      .catch(() => toast.error('No se pudo copiar'))
  }

  return (
    <section className="glass-card rounded-2xl overflow-hidden border border-sky-200/60">
      <header className="bg-sky-50/70 px-5 py-3 border-b border-sky-200/60">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-sky-700" />
          <h2 className="font-serif text-lg font-semibold text-foreground">
            Notificar a los vecinos
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          La liquidación está emitida ({totalUnits} unidades, {itemsWithBalanceCount} con saldo
          pendiente). Estas son las formas de avisarles que ya pueden verla.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/40">
        {/* Canal 1: in-app */}
        <article className="p-5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </span>
            <h3 className="font-medium text-foreground">En la app</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Los propietarios ya pueden ver esta liquidación al ingresar a su panel
            (<code className="text-[10px]">/propietario</code>). No requiere acción.
          </p>
          <div className="pt-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
              <CheckCircle2 className="w-3 h-3" />
              Disponible automáticamente
            </span>
          </div>
        </article>

        {/* Canal 2: PDF */}
        <article className="p-5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Printer className="w-4 h-4" />
            </span>
            <h3 className="font-medium text-foreground">Imprimir / PDF</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Versión imprimible de toda la liquidación. Útil para pasar por debajo de la puerta
            o adjuntar por mail manualmente.
          </p>
          <div className="pt-1">
            <Link
              href={`/print/liquidaciones/${runId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Printer className="w-3 h-3" />
              Abrir vista imprimible
            </Link>
          </div>
        </article>

        {/* Canal 3: WhatsApp / texto */}
        <article className="p-5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <MessageCircle className="w-4 h-4" />
            </span>
            <h3 className="font-medium text-foreground">WhatsApp / mensaje</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Mensaje genérico para mandar al grupo del country. Para enviar individual con
            link al recibo, abrí cada unidad desde la tabla de abajo.
          </p>
          <div className="rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground leading-snug whitespace-pre-line">
            {whatsappMessage}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleCopy('Mensaje', whatsappMessage)}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Copy className="w-3 h-3" />
              {copied === 'Mensaje' ? 'Copiado' : 'Copiar mensaje'}
            </button>
          </div>
        </article>
      </div>

      <footer className="bg-muted/20 border-t border-border/40 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mail className="w-3.5 h-3.5" />
          ¿Querés mandar comunicado masivo por mail a los vecinos?
        </div>
        <Link
          href="/iadmin/comunicaciones"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Ir a Comunicados
        </Link>
      </footer>
    </section>
  )
}
