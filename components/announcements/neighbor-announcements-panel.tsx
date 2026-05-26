'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ArrowLeft, Megaphone, Pin } from 'lucide-react'
import { markAnnouncementReadAction } from '@/app/usuario/actions'
import type { NeighborAnnouncement } from '@/lib/types'

interface Props {
  announcements: NeighborAnnouncement[]
  onBack: () => void
  // Si la URL trae ?id=..., pre-expandimos esa announcement al entrar.
  focusedId?: string | null
}

export function NeighborAnnouncementsPanel({ announcements, onBack, focusedId }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(focusedId ? [focusedId] : []),
  )
  const [, startTransition] = useTransition()
  // Evitar disparar el mark-as-read mas de una vez por announcement en la
  // sesion. El server action es idempotente igual, pero esto reduce ruido.
  const markedRef = useRef<Set<string>>(new Set())

  // Al entrar a la seccion, marcamos como leidos TODOS los visibles no
  // leidos (UX de inbox tradicional). Idempotente del lado del server.
  useEffect(() => {
    const toMark = announcements.filter((a) => !a.isRead && !markedRef.current.has(a.id))
    if (toMark.length === 0) return
    toMark.forEach((a) => markedRef.current.add(a.id))
    startTransition(async () => {
      await Promise.all(
        toMark.map((a) => markAnnouncementReadAction({ announcementId: a.id }).catch(() => null)),
      )
    })
  }, [announcements])

  const pinned = useMemo(() => announcements.filter((a) => a.pinned), [announcements])
  const regular = useMemo(() => announcements.filter((a) => !a.pinned), [announcements])

  function toggle(id: string) {
    setExpanded((curr) => {
      const next = new Set(curr)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <h2 className="font-bold text-foreground text-lg">Comunicados del consorcio</h2>
      </div>

      {announcements.length === 0 ? (
        <div className="glass-card rounded-2xl px-5 py-12 text-center">
          <Megaphone className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Todavía no hay comunicados de tu consorcio. Cuando la administración publique algo, lo
            vas a ver acá.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pinned.length > 0 ? (
            <div className="space-y-2">
              {pinned.map((a) => (
                <AnnouncementCard
                  key={a.id}
                  announcement={a}
                  expanded={expanded.has(a.id)}
                  onToggle={() => toggle(a.id)}
                />
              ))}
              {regular.length > 0 ? (
                <div className="pt-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Otros comunicados
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            {regular.map((a) => (
              <AnnouncementCard
                key={a.id}
                announcement={a}
                expanded={expanded.has(a.id)}
                onToggle={() => toggle(a.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AnnouncementCard({
  announcement,
  expanded,
  onToggle,
}: {
  announcement: NeighborAnnouncement
  expanded: boolean
  onToggle: () => void
}) {
  const publishedRelative = formatRelative(announcement.publishedAt)
  return (
    <div
      className={`glass-card rounded-2xl border ${
        announcement.pinned
          ? 'border-primary/30 bg-primary/[0.03]'
          : 'border-border/40'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {announcement.pinned ? (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-primary">
                  <Pin className="h-3 w-3" />
                  Fijado
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">{publishedRelative}</span>
            </div>
            <h3 className="font-semibold text-foreground">{announcement.title}</h3>
            {!expanded ? (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {announcement.body}
              </p>
            ) : null}
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="px-4 pb-4 -mt-1">
          <div className="text-sm text-foreground whitespace-pre-line border-t border-border/30 pt-3">
            {announcement.body}
          </div>
          {announcement.authorName ? (
            <div className="text-xs text-muted-foreground mt-3">
              Por {announcement.authorName}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function formatRelative(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'hace un instante'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH} h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `hace ${diffD} d`
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}
