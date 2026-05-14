'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { IAdminLegalInfo, IAdminLegalInfoAmenity, IAdminLegalInfoBank, IAdminLegalInfoInsurance } from '@/lib/types'
import { updatePropertyLegalInfo } from '@/app/iadmin/consorcios/[id]/actions'

type Props = {
  propertyId: string
  initial: IAdminLegalInfo
  canEdit: boolean
}

function emptyBank(): IAdminLegalInfoBank {
  return { name: '', cbu: '', alias: '', account: '' }
}

function emptyInsurance(): IAdminLegalInfoInsurance {
  return { company: '', policy: '', coverage: '', from: '', to: '' }
}

function emptyAmenity(): IAdminLegalInfoAmenity {
  return { name: '', price: '', deposit: '' }
}

export function ConsorcioLegalForm({ propertyId, initial, canEdit }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [bank, setBank] = useState<IAdminLegalInfoBank>(initial.bank ?? emptyBank())
  const [accountantName, setAccountantName] = useState(initial.accountantName ?? '')
  const [accountantPhone, setAccountantPhone] = useState(initial.accountantPhone ?? '')
  const [accountantEmail, setAccountantEmail] = useState(initial.accountantEmail ?? '')
  const [collectionSchedule, setCollectionSchedule] = useState(initial.collectionSchedule ?? '')
  const [footerNotes, setFooterNotes] = useState(initial.footerNotes ?? '')
  const [insurance, setInsurance] = useState<IAdminLegalInfoInsurance[]>(initial.insurance ?? [])
  const [amenities, setAmenities] = useState<IAdminLegalInfoAmenity[]>(initial.amenities ?? [])

  if (!canEdit) return null

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload: IAdminLegalInfo = {
      bank: Object.values(bank).some((v) => (v ?? '').trim()) ? bank : undefined,
      accountantName: accountantName.trim() || undefined,
      accountantPhone: accountantPhone.trim() || undefined,
      accountantEmail: accountantEmail.trim() || undefined,
      insurance: insurance.length > 0 ? insurance : undefined,
      amenities: amenities.length > 0 ? amenities : undefined,
      collectionSchedule: collectionSchedule.trim() || undefined,
      footerNotes: footerNotes.trim() || undefined,
    }

    startTransition(async () => {
      try {
        await updatePropertyLegalInfo({ propertyId, legalInfo: payload })
        toast.success('Datos legales guardados')
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
          Editar datos legales del consorcio
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-5 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-foreground">Datos legales y administrativos</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lo que aparece al pie de la liquidacion: banco, seguros, amenities, horarios de cobranza, notas.
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-border/40 p-4">
        <legend className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Cuenta bancaria</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Banco</Label>
            <Input value={bank.name ?? ''} onChange={(e) => setBank({ ...bank, name: e.target.value })} placeholder="Banco Macro" />
          </div>
          <div className="space-y-1.5">
            <Label>Nº de cuenta</Label>
            <Input value={bank.account ?? ''} onChange={(e) => setBank({ ...bank, account: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>CBU</Label>
            <Input value={bank.cbu ?? ''} onChange={(e) => setBank({ ...bank, cbu: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Alias</Label>
            <Input value={bank.alias ?? ''} onChange={(e) => setBank({ ...bank, alias: e.target.value })} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border/40 p-4">
        <legend className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Contador / Referente administrativo</legend>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={accountantName} onChange={(e) => setAccountantName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Telefono</Label>
            <Input value={accountantPhone} onChange={(e) => setAccountantPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={accountantEmail} onChange={(e) => setAccountantEmail(e.target.value)} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border/40 p-4">
        <div className="flex items-center justify-between">
          <legend className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Seguros vigentes</legend>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setInsurance([...insurance, emptyInsurance()])}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
          </Button>
        </div>
        {insurance.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">Sin seguros cargados.</p>
        ) : (
          <div className="space-y-3">
            {insurance.map((ins, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                <div className="md:col-span-2 space-y-1.5">
                  <Label>Compania</Label>
                  <Input
                    value={ins.company ?? ''}
                    onChange={(e) => {
                      const next = [...insurance]
                      next[idx] = { ...ins, company: e.target.value }
                      setInsurance(next)
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Poliza</Label>
                  <Input
                    value={ins.policy ?? ''}
                    onChange={(e) => {
                      const next = [...insurance]
                      next[idx] = { ...ins, policy: e.target.value }
                      setInsurance(next)
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Vig. desde</Label>
                  <Input
                    type="date"
                    value={ins.from ?? ''}
                    onChange={(e) => {
                      const next = [...insurance]
                      next[idx] = { ...ins, from: e.target.value }
                      setInsurance(next)
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Vig. hasta</Label>
                  <Input
                    type="date"
                    value={ins.to ?? ''}
                    onChange={(e) => {
                      const next = [...insurance]
                      next[idx] = { ...ins, to: e.target.value }
                      setInsurance(next)
                    }}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setInsurance(insurance.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="md:col-span-6 space-y-1.5">
                  <Label>Cobertura</Label>
                  <Textarea
                    rows={2}
                    value={ins.coverage ?? ''}
                    onChange={(e) => {
                      const next = [...insurance]
                      next[idx] = { ...ins, coverage: e.target.value }
                      setInsurance(next)
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border/40 p-4">
        <div className="flex items-center justify-between">
          <legend className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amenities</legend>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setAmenities([...amenities, emptyAmenity()])}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
          </Button>
        </div>
        {amenities.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">Sin amenities configurados.</p>
        ) : (
          <div className="space-y-2">
            {amenities.map((a, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                <div className="md:col-span-2 space-y-1.5">
                  <Label>Nombre</Label>
                  <Input
                    value={a.name ?? ''}
                    onChange={(e) => {
                      const next = [...amenities]
                      next[idx] = { ...a, name: e.target.value }
                      setAmenities(next)
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Precio</Label>
                  <Input
                    value={a.price ?? ''}
                    onChange={(e) => {
                      const next = [...amenities]
                      next[idx] = { ...a, price: e.target.value }
                      setAmenities(next)
                    }}
                    placeholder="$40.000"
                  />
                </div>
                <div className="space-y-1.5 flex items-end gap-2">
                  <div className="flex-1">
                    <Label>Deposito</Label>
                    <Input
                      value={a.deposit ?? ''}
                      onChange={(e) => {
                        const next = [...amenities]
                        next[idx] = { ...a, deposit: e.target.value }
                        setAmenities(next)
                      }}
                      placeholder="$40.000"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAmenities(amenities.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Horarios de cobranza</Label>
          <Textarea
            rows={2}
            value={collectionSchedule}
            onChange={(e) => setCollectionSchedule(e.target.value)}
            placeholder="Jueves 10 a 11hs / Miercoles 15 a 16hs"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Notas al pie (texto libre)</Label>
          <Textarea
            rows={2}
            value={footerNotes}
            onChange={(e) => setFooterNotes(e.target.value)}
            placeholder="Texto que aparece al final de la liquidacion"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar datos legales'}
        </Button>
      </div>
    </form>
  )
}
