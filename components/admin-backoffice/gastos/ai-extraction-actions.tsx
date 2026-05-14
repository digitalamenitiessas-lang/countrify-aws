'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { validateAIExtraction } from '@/app/iadmin/gastos/actions'

type Props = {
  extractionId: string
  currentStatus: 'pending' | 'suggested' | 'validated' | 'rejected'
  canValidate: boolean
}

export function AIExtractionActions({ extractionId, currentStatus, canValidate }: Props) {
  const [pending, startTransition] = useTransition()
  const [draftFor, setDraftFor] = useState<'validated' | 'rejected' | null>(null)
  const [notes, setNotes] = useState('')

  if (!canValidate) {
    return (
      <div className="text-xs text-muted-foreground">
        Tu rol no valida extracciones IA.
      </div>
    )
  }

  if (currentStatus === 'validated') {
    return <div className="text-xs text-emerald-700">Extraccion ya validada.</div>
  }

  function runDecision(decision: 'validated' | 'rejected', noteValue?: string) {
    startTransition(async () => {
      try {
        await validateAIExtraction({ extractionId, decision, notes: noteValue })
        toast.success(decision === 'validated' ? 'Extraccion validada' : 'Extraccion rechazada')
        setDraftFor(null)
        setNotes('')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la extraccion')
      }
    })
  }

  function handleClick(decision: 'validated' | 'rejected') {
    if (decision === 'rejected') {
      setDraftFor('rejected')
      return
    }
    // validated: permitir nota opcional
    setDraftFor('validated')
  }

  function submit() {
    if (!draftFor) return
    if (draftFor === 'rejected' && !notes.trim()) {
      toast.error('Indica el motivo del rechazo')
      return
    }
    runDecision(draftFor, notes.trim() || undefined)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => handleClick('validated')}>
          Validar extraccion
        </Button>
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => handleClick('rejected')}>
          Rechazar
        </Button>
      </div>

      {draftFor ? (
        <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
          <Label htmlFor="ai-notes" className="text-xs">
            {draftFor === 'rejected' ? 'Motivo del rechazo (obligatorio)' : 'Notas (opcional)'}
          </Label>
          <Textarea
            id="ai-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={draftFor === 'rejected' ? 'Describi que no coincide con el comprobante...' : 'Comentario de validacion'}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setDraftFor(null)
                setNotes('')
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" disabled={pending} onClick={submit}>
              Confirmar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
