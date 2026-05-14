'use client'

import { useState, useTransition } from 'react'
import { Bell, Check, Clock, Copy, Loader2, MailX, RefreshCw, Share2, TrendingDown, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/admin-backoffice/shared/money'
import type { IAdminManagedProperty, IAdminReminder, IAdminReminderKind, IAdminReminderStatus } from '@/lib/types'
import { bulkUpdateReminders, generateReminders, updateReminderStatus } from '@/app/iadmin/recordatorios/actions'

type Props = {
  administrationId: string
  reminders: IAdminReminder[]
  properties: Pick<IAdminManagedProperty, 'id' | 'displayName' | 'buildingName'>[]
}

const KIND_LABEL: Record<IAdminReminderKind, string> = {
  pre_due: 'Próximo al vencimiento',
  overdue_first: 'Pasó el 1er venc',
  overdue_second: 'Vencido',
  overdue_heavy: 'Mora alta',
}

const KIND_TONE: Record<IAdminReminderKind, string> = {
  pre_due: 'bg-sky-100 text-sky-800',
  overdue_first: 'bg-amber-100 text-amber-800',
  overdue_second: 'bg-orange-100 text-orange-800',
  overdue_heavy: 'bg-rose-100 text-rose-800',
}

const STATUS_LABEL: Record<IAdminReminderStatus, string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  dismissed: 'Descartado',
}

export function RemindersInbox({ administrationId, reminders, properties }: Props) {
  const [pending, startTransition] = useTransition()
  const [filterStatus, setFilterStatus] = useState<IAdminReminderStatus | 'all'>('pending')
  const [filterProperty, setFilterProperty] = useState<string>('')
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = reminders.filter((r) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (filterProperty && r.managedPropertyId !== filterProperty) return false
    return true
  })

  function handleGenerate() {
    setGenerating(true)
    startTransition(async () => {
      try {
        const r = await generateReminders({
          administrationId,
          propertyId: filterProperty || undefined,
        })
        if (r.created > 0) {
          toast.success(`Se generaron ${r.created} recordatorios nuevos`)
        } else {
          toast.info('No hay recordatorios nuevos para generar')
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      } finally {
        setGenerating(false)
      }
    })
  }

  function handleAction(reminderId: string, action: 'sent' | 'dismissed') {
    startTransition(async () => {
      try {
        await updateReminderStatus({ reminderId, action })
        toast.success(action === 'sent' ? 'Marcado como enviado' : 'Descartado')
        setSelected((prev) => {
          const next = new Set(prev)
          next.delete(reminderId)
          return next
        })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllVisiblePending() {
    const ids = filtered.filter((r) => r.status === 'pending').map((r) => r.id)
    setSelected(new Set(ids))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function handleBulkAction(action: 'sent' | 'dismissed') {
    if (selected.size === 0) {
      toast.error('No hay recordatorios seleccionados')
      return
    }
    const ids = Array.from(selected)
    startTransition(async () => {
      try {
        const r = await bulkUpdateReminders({
          administrationId,
          reminderIds: ids,
          action,
        })
        toast.success(`${r.updated} ${action === 'sent' ? 'marcados enviados' : 'descartados'}`)
        clearSelection()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  async function handleCopyAll() {
    const ids = selected.size > 0 ? selected : new Set(filtered.filter((r) => r.status === 'pending').map((r) => r.id))
    if (ids.size === 0) {
      toast.error('No hay mensajes para copiar')
      return
    }
    const texts = filtered
      .filter((r) => ids.has(r.id))
      .map((r) => {
        const header = `━━ ${r.propertyName ?? ''} · ${r.unitCode}${r.holderName ? ` · ${r.holderName}` : ''}${r.holderPhone ? ` · ${r.holderPhone}` : ''} ━━`
        const body = r.messageBody ?? ''
        const link = r.shareUrl ? `\n${r.shareUrl}` : ''
        return `${header}\n${body}${link}`
      })
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(texts)
      toast.success(`${ids.size} mensajes copiados al clipboard`)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  function whatsappHref(r: IAdminReminder): string {
    const phone = (r.holderPhone ?? '').replace(/[^\d+]/g, '')
    const msg = r.shareUrl ? `${r.messageBody ?? ''}\n${r.shareUrl}` : r.messageBody ?? ''
    const base = phone ? `https://wa.me/${phone.startsWith('+') ? phone.slice(1) : phone}` : 'https://wa.me'
    return `${base}?text=${encodeURIComponent(msg)}`
  }

  const pendingCount = reminders.filter((r) => r.status === 'pending').length

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-semibold text-foreground">Bandeja de recordatorios</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generá los recordatorios del día y enviá uno por uno por WhatsApp.
                {pendingCount > 0 ? (
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-[10px] font-medium">
                    {pendingCount} pendientes
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {properties.length > 1 ? (
              <select
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={filterProperty}
                onChange={(e) => setFilterProperty(e.target.value)}
              >
                <option value="">Todos los consorcios</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName ?? p.buildingName}
                  </option>
                ))}
              </select>
            ) : null}
            <Button size="sm" disabled={generating || pending} onClick={handleGenerate}>
              {generating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Generando…
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Generar de hoy
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="mt-4 flex items-center gap-1 flex-wrap">
          {(['pending', 'sent', 'dismissed', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setFilterStatus(s)
                clearSelection()
              }}
              className={`px-3 py-1 rounded-full text-xs transition-colors ${
                filterStatus === s
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {s === 'all' ? 'Todos' : STATUS_LABEL[s as IAdminReminderStatus]}
              {' '}
              ({reminders.filter((r) => s === 'all' || r.status === s).length})
            </button>
          ))}
        </div>
      </div>

      {/* Barra de acciones masivas */}
      {filterStatus === 'pending' && filtered.some((r) => r.status === 'pending') ? (
        <div className="glass-card rounded-2xl p-3 flex items-center gap-2 flex-wrap text-sm">
          <button
            type="button"
            className="text-xs text-primary hover:underline font-medium"
            onClick={selectAllVisiblePending}
          >
            Seleccionar los {filtered.filter((r) => r.status === 'pending').length} pendientes
          </button>
          {selected.size > 0 ? (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                {selected.size} seleccionados
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={clearSelection}
              >
                limpiar
              </button>
              <div className="flex-1" />
              <Button size="sm" variant="outline" disabled={pending} onClick={handleCopyAll}>
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copiar textos
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => handleBulkAction('sent')}>
                <Check className="w-3.5 h-3.5 mr-1.5" />
                Marcar enviados
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => handleBulkAction('dismissed')}>
                <X className="w-3.5 h-3.5 mr-1.5" />
                Descartar
              </Button>
            </>
          ) : (
            <>
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={handleCopyAll}>
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copiar todos los textos pendientes
              </Button>
            </>
          )}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl px-5 py-12 text-center text-sm text-muted-foreground">
          Sin recordatorios en este filtro.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li key={r.id} className="glass-card rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                {r.status === 'pending' ? (
                  <input
                    type="checkbox"
                    className="mt-1 shrink-0"
                    checked={selected.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${KIND_TONE[r.reminderKind]}`}>
                      {KIND_LABEL[r.reminderKind]}
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      {r.propertyName ?? ''} · {r.unitCode}
                      {r.holderName ? <span className="text-muted-foreground font-normal"> · {r.holderName}</span> : null}
                    </span>
                    {r.status !== 'pending' ? (
                      <span className="text-[10px] rounded-full bg-muted text-muted-foreground px-2 py-0.5">
                        {STATUS_LABEL[r.status]}
                      </span>
                    ) : null}
                  </div>
                  {r.messageBody ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{r.messageBody}</p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    {r.amountDue !== null ? (
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">
                        <Money amount={r.amountDue} />
                      </span>
                    ) : null}
                    {r.dueDate ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Venc: {r.dueDate}
                        {r.dueLabel ? ` (${r.dueLabel})` : ''}
                      </span>
                    ) : null}
                    {r.holderPhone ? (
                      <span className="text-muted-foreground">📱 {r.holderPhone}</span>
                    ) : (
                      <span className="text-amber-700">Sin teléfono del titular</span>
                    )}
                  </div>
                </div>
                {r.status === 'pending' ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={whatsappHref(r)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-700"
                      onClick={() => handleAction(r.id, 'sent')}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => handleAction(r.id, 'sent')}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => handleAction(r.id, 'dismissed')}
                      title="Descartar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _icons = { MailX, TrendingDown }
