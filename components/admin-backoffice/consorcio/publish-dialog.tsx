'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  Search,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AnimatedNumber } from '@/components/admin-backoffice/shared/animated-number'
import type { EmitAndNotifyResult, NeighborMessage } from '@/app/iadmin/consorcios/[id]/planilla/actions'

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

type Filter = 'all' | 'whatsapp' | 'email' | 'no-contact'

export function PublishDialog({
  result,
  onClose,
}: {
  result: EmitAndNotifyResult
  onClose: () => void
}) {
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [bulkSending, setBulkSending] = useState(false)

  const withPhone = useMemo(
    () => result.neighbors.filter((n) => n.holderPhone && n.whatsappHref),
    [result.neighbors],
  )
  const withEmail = useMemo(
    () => result.neighbors.filter((n) => n.holderEmail),
    [result.neighbors],
  )
  const withoutContact = useMemo(
    () => result.neighbors.filter((n) => !n.holderPhone && !n.holderEmail),
    [result.neighbors],
  )

  const filtered = useMemo(() => {
    let list = result.neighbors
    if (filter === 'whatsapp') list = withPhone
    else if (filter === 'email') list = withEmail
    else if (filter === 'no-contact') list = withoutContact
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (n) =>
          n.unitCode.toLowerCase().includes(q) ||
          (n.holderName ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [filter, search, result.neighbors, withPhone, withEmail, withoutContact])

  const sentPct = result.neighbors.length > 0
    ? Math.round((sentIds.size / result.neighbors.length) * 100)
    : 0
  const avgPerUnit = result.neighbors.length > 0
    ? result.liquidated / result.neighbors.length
    : 0

  function markSent(itemId: string) {
    setSentIds((prev) => new Set(prev).add(itemId))
  }

  async function copyAll() {
    const lines = result.neighbors.map(
      (n) =>
        `━ ${n.unitCode}${n.holderName ? ` · ${n.holderName}` : ''}${n.holderPhone ? ` · ${n.holderPhone}` : ''} ━\n${n.message}`,
    )
    try {
      await navigator.clipboard.writeText(lines.join('\n\n'))
      toast.success(`${result.neighbors.length} mensajes copiados`)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  function mailtoAll() {
    const to = withEmail.map((n) => n.holderEmail).join(',')
    const subject = `Liquidación de expensas ${result.periodLabel}`
    const body = 'Les envío los detalles de la liquidación. Responden a este email por cualquier consulta.'
    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  async function sendAllWhatsApp() {
    const targets = withPhone.filter((n) => !sentIds.has(n.itemId))
    if (targets.length === 0) {
      toast.info('Ya mandaste a todos los que tienen WhatsApp')
      return
    }
    setBulkSending(true)
    try {
      // Staggered: abrimos cada wa.me con 400ms de delay para no abrumar el browser
      for (const [idx, n] of targets.entries()) {
        window.setTimeout(() => {
          if (!n.whatsappHref) return
          window.open(n.whatsappHref, '_blank', 'noopener,noreferrer')
          markSent(n.itemId)
        }, idx * 450)
      }
      toast.success(`Abriendo ${targets.length} WhatsApp en cascada — confirmá cada envío`)
    } finally {
      // Dejamos el "bulkSending" para todo el stagger
      window.setTimeout(() => setBulkSending(false), targets.length * 450 + 200)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden flex flex-col max-h-[92vh]">
        <DialogHeader className="sr-only">
          <DialogTitle>Liquidación emitida</DialogTitle>
          <DialogDescription>
            Período {result.periodLabel} — {result.neighbors.length} unidades
          </DialogDescription>
        </DialogHeader>

        {/* Hero de "emitida" */}
        <header className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-primary/5 border-b border-border/30">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-4">
            <div className="relative w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
              <Sparkles className="w-3.5 h-3.5 absolute -top-0.5 -right-0.5 text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-700 font-medium">
                Liquidación emitida
              </p>
              <h2 className="font-serif text-2xl font-bold text-foreground leading-tight">
                Período {result.periodLabel}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Ya está calculada y lista para avisar. Los residentes pueden ver su detalle con el link personalizado.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <HeroStat label="Total liquidado" value={formatARS(result.liquidated)} />
            <HeroStat
              label="Unidades"
              value={`${result.neighbors.length}`}
              hint={`promedio ${formatARS(Math.round(avgPerUnit))}`}
            />
            <HeroStat
              label="Enviados"
              value={`${sentIds.size} / ${result.neighbors.length}`}
              hint={`${sentPct}% avisados`}
            />
          </div>

          {/* Progress bar global */}
          <div className="mt-3 h-1 rounded-full bg-emerald-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-[width] duration-500"
              style={{ width: `${sentPct}%` }}
            />
          </div>
        </header>

        {/* Acciones masivas */}
        <div className="px-6 py-3 border-b border-border/30 bg-muted/10 flex items-center gap-2 flex-wrap">
          {withPhone.length > 0 ? (
            <Button
              size="sm"
              onClick={sendAllWhatsApp}
              disabled={bulkSending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {bulkSending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Abriendo…
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                  Enviar por WhatsApp · {withPhone.length}
                </>
              )}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={copyAll}>
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            Copiar todos
          </Button>
          {withEmail.length > 0 ? (
            <a
              href={mailtoAll()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              Email {withEmail.length}
            </a>
          ) : null}
          <a
            href={`/print/liquidaciones/${result.runId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            PDF imprimible
          </a>
        </div>

        {/* Filtros + búsqueda */}
        <div className="px-6 py-2.5 border-b border-border/30 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar vecino o unidad…"
              className="w-full text-xs pl-8 pr-2 py-1.5 rounded-full border border-border/50 bg-background focus:outline-none focus:border-primary/40 focus:shadow-[0_0_0_3px_rgba(17, 34, 80,0.08)] transition-shadow"
            />
          </div>
          <div className="flex-1" />
          <div className="seg text-[11px]" role="group" aria-label="Filtro">
            {(['all', 'whatsapp', 'email', 'no-contact'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === 'all'
                  ? `Todos (${result.neighbors.length})`
                  : f === 'whatsapp'
                    ? `WhatsApp (${withPhone.length})`
                    : f === 'email'
                      ? `Email (${withEmail.length})`
                      : `Sin contacto (${withoutContact.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de residentes */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {withoutContact.length > 0 && filter === 'all' ? (
            <div className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              {withoutContact.length} vecino{withoutContact.length === 1 ? '' : 's'} sin contacto cargado. Cargá teléfonos en <b>Configuración → Datos del consorcio</b> para mandar por WhatsApp.
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Sin residentes que coincidan con este filtro.
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((n) => (
                <NeighborRow
                  key={n.itemId}
                  neighbor={n}
                  sent={sentIds.has(n.itemId)}
                  onMarkSent={() => markSent(n.itemId)}
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="px-6 py-3 border-t border-border/30 bg-muted/10 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground italic">
            Al hacer clic en WhatsApp se abre la app con el mensaje pre-llenado. Vos confirmás el envío.
          </p>
          <Button size="sm" variant="outline" onClick={onClose}>
            Listo
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

function HeroStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  // Extraer el número de strings como "$ 123.456" o "5 / 10" para animar
  const numericMatch = value.match(/-?[\d.,]+/)
  const numeric = numericMatch ? Number(numericMatch[0].replace(/[^\d-]/g, '')) : 0

  return (
    <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 backdrop-blur-sm">
      <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium">{label}</p>
      <p className="stat-value font-serif text-[16px] font-semibold text-foreground tabular-nums leading-tight mt-0.5">
        <AnimatedNumber value={numeric} format={() => value} duration={620} />
      </p>
      {hint ? <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p> : null}
    </div>
  )
}

function NeighborRow({
  neighbor: n,
  sent,
  onMarkSent,
}: {
  neighbor: NeighborMessage
  sent: boolean
  onMarkSent: () => void
}) {
  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(n.message)
      toast.success(`Mensaje de ${n.unitCode} copiado`)
      onMarkSent()
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <li
      className={`rounded-lg border px-3 py-2 flex items-start gap-3 transition-colors ${
        sent ? 'border-emerald-200 bg-emerald-50/40' : 'border-border/30 bg-background hover:bg-muted/20'
      }`}
    >
      <div className="w-12 shrink-0 text-xs font-medium text-foreground tabular-nums pt-0.5">
        {n.unitCode}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {n.holderName ?? <span className="italic text-muted-foreground">Sin titular</span>}
          </span>
          <span className="tabular-nums text-sm font-semibold text-foreground shrink-0">
            {formatARS(n.amountToPay)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
          {n.holderPhone ? (
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="w-2.5 h-2.5" />
              {n.holderPhone}
            </span>
          ) : null}
          {n.holderEmail ? (
            <span className="inline-flex items-center gap-1">
              <Mail className="w-2.5 h-2.5" />
              {n.holderEmail}
            </span>
          ) : null}
          {!n.holderPhone && !n.holderEmail ? (
            <span className="italic">sin contacto</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {n.shareUrl ? (
          <a
            href={n.shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-border/50 bg-background p-1.5 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
            title="Ver liquidación del vecino"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : null}
        {n.holderPhone && n.whatsappHref ? (
          <a
            href={n.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onMarkSent}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              sent
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {sent ? <Check className="w-3.5 h-3.5" /> : <MessageCircle className="w-3.5 h-3.5" />}
            {sent ? 'Enviado' : 'WhatsApp'}
          </a>
        ) : (
          <button
            type="button"
            onClick={copyMessage}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
              sent
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-border/50 bg-background hover:bg-muted'
            }`}
            title="Copiar mensaje"
          >
            {sent ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {sent ? 'Copiado' : 'Copiar'}
          </button>
        )}
      </div>
    </li>
  )
}
