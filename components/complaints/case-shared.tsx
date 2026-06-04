'use client'

import type { ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import { AtSign, Clock3, SendHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type {
  ComplaintCaseMessageMention,
  ComplaintCaseMentionableUser,
  ComplaintCaseSection,
  ComplaintCaseStatus,
  ComplaintCaseSummaryByReason,
} from '@/lib/types'

export function statusCopy(status: ComplaintCaseStatus) {
  switch (status) {
    case 'en_revision':
      return { label: 'En revision', className: 'border-sky-300/60 bg-sky-50 text-sky-900' }
    case 'en_desarrollo':
      return { label: 'En desarrollo', className: 'border-amber-300/60 bg-amber-50 text-amber-900' }
    case 'en_espera':
      return { label: 'En espera', className: 'border-orange-300/60 bg-orange-50 text-orange-900' }
    case 'resuelto':
      return { label: 'Resuelto', className: 'border-emerald-300/60 bg-emerald-50 text-emerald-900' }
    case 'cerrado':
      return { label: 'Cerrado', className: 'border-zinc-300/60 bg-zinc-100 text-zinc-800' }
    default:
      return { label: 'Nuevo', className: 'border-violet-300/60 bg-violet-50 text-violet-900' }
  }
}

export function StatusBadge({ status }: { status: ComplaintCaseStatus }) {
  const copy = statusCopy(status)
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${copy.className}`}>{copy.label}</span>
}

export function sortReasonSummary(summary: ComplaintCaseSummaryByReason[]) {
  return [...summary].sort((a, b) => b.count - a.count || a.reasonLabel.localeCompare(b.reasonLabel))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function renderMessageWithMentions(message: string, mentions: ComplaintCaseMessageMention[]) {
  if (!mentions.length) {
    return <span>{message}</span>
  }

  const labels = Array.from(new Set(mentions.map((mention) => `@${mention.label}`))).sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(${labels.map(escapeRegExp).join('|')})`, 'g')
  const parts = message.split(pattern)

  return (
    <>
      {parts.map((part, index) => {
        if (labels.includes(part)) {
          return (
            <span key={`${part}-${index}`} className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
              {part}
            </span>
          )
        }
        return <span key={`${part}-${index}`}>{part}</span>
      })}
    </>
  )
}

export function CaseDetailTabs({
  value,
  onValueChange,
}: {
  value: ComplaintCaseSection
  onValueChange: (value: ComplaintCaseSection) => void
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as ComplaintCaseSection)} className="gap-0">
      <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-background/70 p-1">
        <TabsTrigger value="summary" className="rounded-xl text-xs sm:text-sm">Resumen</TabsTrigger>
        <TabsTrigger value="forum" className="rounded-xl text-xs sm:text-sm">Foro</TabsTrigger>
        <TabsTrigger value="events" className="rounded-xl text-xs sm:text-sm">Movimientos</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

function findMentionState(value: string, caretIndex: number) {
  const beforeCaret = value.slice(0, caretIndex)
  const mentionStart = beforeCaret.lastIndexOf('@')
  if (mentionStart < 0) {
    return null
  }
  if (mentionStart > 0 && /\S/.test(beforeCaret[mentionStart - 1])) {
    return null
  }
  const query = beforeCaret.slice(mentionStart + 1)
  if (/[\n\r]/.test(query)) {
    return null
  }
  if (query.includes('@')) {
    return null
  }
  return { mentionStart, caretIndex, query }
}

export function ComplaintMessageComposer({
  label,
  value,
  onValueChange,
  onSubmit,
  mentionableUsers,
  disabled,
  isSubmitting,
  placeholder,
  submitLabel,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  onSubmit: (mentionedProfileIds: string[]) => Promise<boolean | void>
  mentionableUsers: ComplaintCaseMentionableUser[]
  disabled: boolean
  isSubmitting: boolean
  placeholder: string
  submitLabel: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [activeMention, setActiveMention] = useState<{ mentionStart: number; caretIndex: number; query: string } | null>(null)
  const [selectedMentions, setSelectedMentions] = useState<ComplaintCaseMentionableUser[]>([])

  const suggestions = useMemo(() => {
    const query = (activeMention?.query ?? '').toLowerCase().trim()
    return mentionableUsers
      .filter((user) => user.label.toLowerCase().includes(query) || user.fullName.toLowerCase().includes(query))
      .slice(0, 8)
  }, [activeMention, mentionableUsers])

  const activeSelectedMentions = useMemo(
    () => selectedMentions.filter((mention) => value.includes(`@${mention.label}`)),
    [selectedMentions, value],
  )

  function handleChange(nextValue: string, caretIndex: number) {
    onValueChange(nextValue)
    if (!nextValue.trim()) {
      setSelectedMentions([])
    } else {
      setSelectedMentions((current) => current.filter((mention) => nextValue.includes(`@${mention.label}`)))
    }
    setActiveMention(findMentionState(nextValue, caretIndex))
  }

  function insertMention(user: ComplaintCaseMentionableUser) {
    if (!activeMention) {
      return
    }
    const nextValue = `${value.slice(0, activeMention.mentionStart)}@${user.label} ${value.slice(activeMention.caretIndex)}`
    onValueChange(nextValue)
    setSelectedMentions((current) => (current.some((item) => item.profileId === user.profileId) ? current : [...current, user]))
    setActiveMention(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const mentionedProfileIds = activeSelectedMentions.map((mention) => mention.profileId)
    const result = await onSubmit(mentionedProfileIds)
    if (result !== false) {
      setSelectedMentions([])
      setActiveMention(null)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border/60 bg-background/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <AtSign className="w-3.5 h-3.5" />
          Arroba vecinos o consorcio
        </div>
      </div>

      {activeSelectedMentions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {activeSelectedMentions.map((mention) => (
            <Badge key={mention.profileId} variant="outline">@{mention.label}</Badge>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => handleChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
          onClick={(event) => handleChange((event.target as HTMLTextAreaElement).value, (event.target as HTMLTextAreaElement).selectionStart ?? value.length)}
          onKeyUp={(event) => handleChange((event.target as HTMLTextAreaElement).value, (event.target as HTMLTextAreaElement).selectionStart ?? value.length)}
          rows={5}
          disabled={disabled || isSubmitting}
          placeholder={placeholder}
        />

        {activeMention && suggestions.length > 0 ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border border-border/70 bg-background shadow-xl">
            <div className="px-3 py-2 border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
              Personas del expediente
            </div>
            <div className="max-h-56 overflow-y-auto p-2">
              {suggestions.map((user) => (
                <button
                  key={user.profileId}
                  type="button"
                  onClick={() => insertMention(user)}
                  className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-primary/5"
                >
                  <div>
                    <div className="text-sm font-medium text-foreground">{user.label}</div>
                    <div className="text-xs text-muted-foreground">{user.role === 'consorcio_admin' ? 'Consorcio' : user.unitLabel ?? 'Vecino del edificio'}</div>
                  </div>
                  <Badge variant="secondary">{user.role === 'consorcio_admin' ? 'Consorcio' : 'Vecino'}</Badge>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Escribi <code>@</code> para mencionar a alguien del edificio.
        </div>
        <Button type="submit" disabled={disabled || !value.trim() || isSubmitting} className="gap-2">
          <SendHorizontal className="w-4 h-4" />
          {isSubmitting ? 'Enviando...' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

export function ComplaintListSearch({
  value,
  onValueChange,
  placeholder,
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
}) {
  return <Input value={value} onChange={(event) => onValueChange(event.target.value)} placeholder={placeholder} className="bg-background/60" />
}

export function ComplaintEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center">
      <Clock3 className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  )
}

export function ComplaintSectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-primary">{icon}</div>
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </div>
    </div>
  )
}
