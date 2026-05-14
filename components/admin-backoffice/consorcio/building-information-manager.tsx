'use client'

import { useState, useTransition } from 'react'
import { Info, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { BuildingInformationItem, BuildingInformationVisibility } from '@/lib/types'
import {
  createBuildingInformation,
  deactivateBuildingInformation,
} from '@/app/iadmin/consorcios/[id]/actions'

const VISIBILITY_OPTIONS: Array<{ value: BuildingInformationVisibility; label: string }> = [
  { value: 'residentes', label: 'Residentes y propietarios' },
  { value: 'residentes', label: 'Solo residentes' },
  { value: 'propietarios', label: 'Solo propietarios' },
]

export function BuildingInformationManager({
  propertyId,
  items,
  canEdit,
}: {
  propertyId: string
  items: BuildingInformationItem[]
  canEdit: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [confirmItem, setConfirmItem] = useState<BuildingInformationItem | null>(null)
  const [draft, setDraft] = useState({
    title: '',
    category: 'general',
    content: '',
    visibleTo: 'residentes' as BuildingInformationVisibility,
    sortOrder: '0',
  })

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      try {
        await createBuildingInformation({
          propertyId,
          title: draft.title,
          category: draft.category,
          content: draft.content,
          visibleTo: draft.visibleTo,
          sortOrder: Number(draft.sortOrder || 0),
        })
        toast.success('Informacion publicada')
        setDraft({ title: '', category: 'general', content: '', visibleTo: 'residentes', sortOrder: '0' })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function remove(itemId: string) {
    const selected = items.find((item) => item.id === itemId) ?? null
    if (!selected) {
      toast.error('No encontramos el item seleccionado.')
      return
    }
    setConfirmItem(selected)
  }

  function confirmRemove() {
    if (!confirmItem) return
    startTransition(async () => {
      try {
        await deactivateBuildingInformation({ propertyId, itemId: confirmItem.id })
        toast.success('Informacion ocultada')
        setConfirmItem(null)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  return (
    <>
    <div className="space-y-4">
      {canEdit ? (
        <form onSubmit={submit} className="rounded-2xl border border-border/40 bg-muted/20 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Titulo</Label>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Visibilidad</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={draft.visibleTo}
                onChange={(e) => setDraft({ ...draft, visibleTo: e.target.value as BuildingInformationVisibility })}
              >
                {VISIBILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Contenido</Label>
            <textarea
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              required
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
              placeholder="Ej: Horario de pileta, uso del SUM, reglas de ruidos, contactos utiles..."
            />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="space-y-1.5">
              <Label>Orden</Label>
              <Input
                type="number"
                min={0}
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
              />
            </div>
            <Button type="submit" disabled={pending}>Publicar informacion</Button>
          </div>
        </form>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
          Todavia no hay informacion general cargada para este country.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-border/40 bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <Info className="w-3 h-3" />
                    {item.category}
                  </div>
                  <h3 className="mt-2 font-semibold text-foreground">{item.title}</h3>
                </div>
                {canEdit ? (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(item.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{item.content}</p>
              <div className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                {VISIBILITY_OPTIONS.find((option) => option.value === item.visibleTo)?.label ?? item.visibleTo}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
    <AlertDialog open={Boolean(confirmItem)} onOpenChange={(open) => (!open ? setConfirmItem(null) : undefined)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ocultar informacion</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmItem ? `Se ocultara "${confirmItem.title}" para los residentes.` : 'Se ocultara este contenido.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmRemove}>
            Si, ocultar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
