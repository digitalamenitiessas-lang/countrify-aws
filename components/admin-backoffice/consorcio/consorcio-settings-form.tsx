'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { IAdminManagedProperty, IAdminPropertyKind } from '@/lib/types'
import { updateManagedProperty } from '@/app/iadmin/consorcios/[id]/actions'

type Props = {
  property: IAdminManagedProperty
  canEdit: boolean
}

const KIND_OPTIONS: Array<{ value: IAdminPropertyKind; label: string }> = [
  { value: 'consorcio', label: 'Consorcio' },
  { value: 'barrio_privado', label: 'Barrio privado' },
  { value: 'country', label: 'Country' },
  { value: 'mixto', label: 'Mixto' },
]

export function ConsorcioSettingsForm({ property, canEdit }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState({
    displayName: property.displayName ?? property.buildingName,
    taxId: property.taxId ?? '',
    managementFeePct: property.managementFeePct?.toString() ?? '',
    managedSince: property.managedSince ?? '',
    propertyKind: property.propertyKind as IAdminPropertyKind,
    notes: property.notes ?? '',
  })

  if (!canEdit) return null

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const feeNum = draft.managementFeePct ? Number(draft.managementFeePct.replace(',', '.')) : null
    if (feeNum !== null && (!Number.isFinite(feeNum) || feeNum < 0 || feeNum > 100)) {
      toast.error('Fee invalido')
      return
    }
    startTransition(async () => {
      try {
        await updateManagedProperty({
          propertyId: property.id,
          displayName: draft.displayName || null,
          taxId: draft.taxId || null,
          managementFeePct: feeNum,
          managedSince: draft.managedSince || null,
          propertyKind: draft.propertyKind,
          notes: draft.notes || null,
        })
        toast.success('Datos actualizados')
        setOpen(false)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al guardar')
      }
    })
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Editar datos del consorcio
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-foreground">Datos del consorcio</h3>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nombre a mostrar</Label>
          <Input value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={draft.propertyKind}
            onChange={(e) => setDraft({ ...draft, propertyKind: e.target.value as IAdminPropertyKind })}
          >
            {KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>CUIT</Label>
          <Input value={draft.taxId} onChange={(e) => setDraft({ ...draft, taxId: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Fee de administracion (%)</Label>
          <Input
            inputMode="decimal"
            value={draft.managementFeePct}
            onChange={(e) => setDraft({ ...draft, managementFeePct: e.target.value })}
            placeholder="5.00"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Inicio de gestion</Label>
          <Input type="date" value={draft.managedSince} onChange={(e) => setDraft({ ...draft, managedSince: e.target.value })} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Notas</Label>
          <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
