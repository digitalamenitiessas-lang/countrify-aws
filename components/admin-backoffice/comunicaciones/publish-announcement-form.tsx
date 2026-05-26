'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { publishAnnouncement } from '@/app/iadmin/comunicaciones/actions'

type Props = {
  buildings: Array<{ id: string; name: string }>
  initialBody?: string
  initialTitle?: string
}

export function PublishAnnouncementForm({ buildings, initialBody, initialTitle }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [buildingId, setBuildingId] = useState<string>(buildings[0]?.id ?? '')
  const [title, setTitle] = useState(initialTitle ?? '')
  const [body, setBody] = useState(initialBody ?? '')
  const [pinned, setPinned] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!buildingId) {
      toast.error('Seleccioná un consorcio')
      return
    }
    if (title.trim().length < 3) {
      toast.error('Asunto demasiado corto')
      return
    }
    if (body.trim().length < 5) {
      toast.error('Cuerpo del comunicado vacío')
      return
    }
    startTransition(async () => {
      try {
        await publishAnnouncement({
          buildingId,
          title: title.trim(),
          body: body.trim(),
          pinned,
          expiresAt: expiresAt || null,
        })
        toast.success('Comunicado publicado.')
        setTitle('')
        setBody('')
        setPinned(false)
        setExpiresAt('')
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo publicar')
      }
    })
  }

  if (buildings.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Tu cuenta no tiene consorcios asignados. Pedí al super admin que te vincule a uno.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Consorcio *</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={buildingId}
            onChange={(e) => setBuildingId(e.target.value)}
            required
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Expira el (opcional)</Label>
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Asunto *</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej: Corte de agua el sábado de 9 a 13hs"
          maxLength={200}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>Cuerpo *</Label>
        <Textarea
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribí el comunicado o copiá la versión generada por la IA abajo."
          maxLength={8000}
          required
        />
        <p className="text-xs text-muted-foreground">
          Los saltos de línea se respetan. Sin formato HTML.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch checked={pinned} onCheckedChange={setPinned} />
          <span className="text-sm">Fijar al tope del feed del vecino</span>
        </label>
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Publicar
        </Button>
      </div>
    </form>
  )
}
