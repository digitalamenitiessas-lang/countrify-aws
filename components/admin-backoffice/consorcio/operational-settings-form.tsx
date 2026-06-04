'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { IAdminOperationalDueDateRule, IAdminOperationalSettings } from '@/lib/types'
import { updatePropertyOperationalSettings } from '@/app/iadmin/consorcios/[id]/actions'

type Props = {
  propertyId: string
  initial: IAdminOperationalSettings
  canEdit: boolean
}

type DueRuleDraft = {
  label: string
  day: string
  surchargePct: string
}

const DEFAULT_RULES: DueRuleDraft[] = [
  { label: '1er vencimiento', day: '10', surchargePct: '0' },
  { label: '2do vencimiento', day: '25', surchargePct: '3' },
]

function toDraft(rules: IAdminOperationalDueDateRule[] | undefined): DueRuleDraft[] {
  if (!rules || rules.length === 0) return DEFAULT_RULES
  return rules.slice(0, 3).map((rule) => ({
    label: rule.label,
    day: String(rule.day),
    surchargePct: String(rule.surchargePct),
  }))
}

export function OperationalSettingsForm({ propertyId, initial, canEdit }: Props) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState<DueRuleDraft[]>(() => toDraft(initial.dueDateRules))
  const [legalDebtNotice, setLegalDebtNotice] = useState(initial.legalDebtNotice ?? '')
  const [allowManualAdjustments, setAllowManualAdjustments] = useState(Boolean(initial.allowManualAdjustments))

  const paymentAllocationMode = useMemo(
    () => initial.paymentAllocationMode ?? 'fifo_oldest_first',
    [initial.paymentAllocationMode],
  )

  if (!canEdit) return null

  function updateRule(index: number, patch: Partial<DueRuleDraft>) {
    setRules((current) => current.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)))
  }

  function addRule() {
    if (rules.length >= 3) return
    setRules((current) => [...current, { label: `${current.length + 1}er vencimiento`, day: '', surchargePct: '0' }])
  }

  function removeRule(index: number) {
    setRules((current) => current.filter((_, idx) => idx !== index))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedRules = rules.map((rule) => ({
      label: rule.label.trim(),
      day: Number(rule.day),
      surchargePct: Number(rule.surchargePct.replace(',', '.')),
    }))
    if (parsedRules.some((rule) => !rule.label || !Number.isInteger(rule.day) || rule.day < 1 || rule.day > 28)) {
      toast.error('Cada vencimiento necesita etiqueta y dia valido (1-28).')
      return
    }
    if (parsedRules.some((rule) => !Number.isFinite(rule.surchargePct) || rule.surchargePct < 0 || rule.surchargePct > 100)) {
      toast.error('Los recargos deben estar entre 0 y 100.')
      return
    }

    startTransition(async () => {
      try {
        await updatePropertyOperationalSettings({
          propertyId,
          operationalSettings: {
            dueDateRules: parsedRules,
            paymentAllocationMode,
            closePeriodPolicy: 'issued_required',
            allowManualAdjustments,
            legalDebtNotice: legalDebtNotice.trim() || undefined,
          },
        })
        toast.success('Politica operativa actualizada')
        setOpen(false)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo guardar')
      }
    })
  }

  if (!open) {
    return (
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium text-foreground">Politica de vencimientos y mora</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {rules.map((rule) => `${rule.label}: dia ${rule.day} (+${rule.surchargePct}%)`).join(' · ')}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Editar politica
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-foreground">Politica de vencimientos y mora</h3>
          <p className="text-xs text-muted-foreground mt-1">
            La deuda nace al emitir. El cierre del periodo exige liquidacion emitida.
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

      <div className="space-y-3">
        {rules.map((rule, index) => (
          <div key={`${index}-${rule.label}`} className="grid grid-cols-1 md:grid-cols-[1.4fr_0.8fr_0.8fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Etiqueta</Label>
              <Input value={rule.label} onChange={(e) => updateRule(index, { label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Dia</Label>
              <Input inputMode="numeric" value={rule.day} onChange={(e) => updateRule(index, { day: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Recargo %</Label>
              <Input
                inputMode="decimal"
                value={rule.surchargePct}
                onChange={(e) => updateRule(index, { surchargePct: e.target.value })}
              />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeRule(index)} disabled={rules.length === 1}>
              Quitar
            </Button>
          </div>
        ))}
      </div>

      <div className="flex justify-start">
        <Button type="button" size="sm" variant="outline" onClick={addRule} disabled={rules.length >= 3}>
          Agregar vencimiento
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
          <div className="text-sm font-medium text-foreground">Aplicacion de pagos</div>
          <p className="text-xs text-muted-foreground mt-1">
            FIFO por antiguedad, priorizando capital antes que recargos del mismo tramo.
          </p>
        </div>
        <label className="rounded-xl border border-border/50 bg-muted/20 p-4 flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={allowManualAdjustments}
            onChange={(e) => setAllowManualAdjustments(e.target.checked)}
          />
          <div>
            <div className="text-sm font-medium text-foreground">Permitir ajustes manuales</div>
            <p className="text-xs text-muted-foreground mt-1">
              Habilita asientos manuales posteriores sobre la cuenta corriente de la unidad.
            </p>
          </div>
        </label>
      </div>

      <div className="space-y-1.5">
        <Label>Aviso legal / operativo de deuda</Label>
        <Textarea
          rows={4}
          value={legalDebtNotice}
          onChange={(e) => setLegalDebtNotice(e.target.value)}
          placeholder="Texto que se mostrara en liquidaciones y gestiones de mora."
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar politica'}
        </Button>
      </div>
    </form>
  )
}
