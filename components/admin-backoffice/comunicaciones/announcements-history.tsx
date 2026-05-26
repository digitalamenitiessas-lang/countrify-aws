'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pin, Trash2, Users, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteAnnouncement } from '@/app/iadmin/comunicaciones/actions'

type Item = {
  id: string
  buildingName: string | null
  authorName: string | null
  title: string
  body: string
  pinned: boolean
  expiresAt: string | null
  publishedAt: string
  readCount: number
}

export function AnnouncementsHistory({ items }: { items: Item[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function handleDelete(id: string, title: string) {
    if (!window.confirm(`¿Borrar "${title}"? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      try {
        await deleteAnnouncement(id)
        toast.success('Comunicado borrado')
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo borrar')
      }
    })
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
        Todavía no publicaste ningún comunicado. Cuando lo hagas, vas a ver acá el historial con
        métricas de lectura.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isExpanded = expandedId === item.id
        const expired = item.expiresAt && new Date(item.expiresAt) < new Date()
        return (
          <div
            key={item.id}
            className={`rounded-xl border border-border/40 bg-muted/10 p-3 ${expired ? 'opacity-60' : ''}`}
          >
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
              className="w-full text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.pinned ? (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-primary">
                        <Pin className="h-3 w-3" />
                        Fijado
                      </span>
                    ) : null}
                    {expired ? (
                      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground">
                        Expirado
                      </span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {item.buildingName ?? '—'} ·{' '}
                      {new Date(item.publishedAt).toLocaleString('es-AR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="font-medium text-sm text-foreground mt-1">{item.title}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {item.readCount} {item.readCount === 1 ? 'lectura' : 'lecturas'}
                  </div>
                </div>
              </div>
            </button>

            {isExpanded ? (
              <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
                <div className="text-sm text-foreground whitespace-pre-line">{item.body}</div>
                <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    {item.authorName ? <span>Por {item.authorName}</span> : null}
                    {item.expiresAt ? (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Expira {new Date(item.expiresAt).toLocaleDateString('es-AR')}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(item.id, item.title)}
                    disabled={pending}
                    className="gap-1.5 text-rose-700 hover:text-rose-900"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Borrar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
