'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { IAdminCapability, IAdminExpenseStatus } from '@/lib/types'
import { EXPENSE_TRANSITIONS } from '@/lib/iadmin/expense-status'
import { changeExpenseStatus } from '@/app/iadmin/gastos/actions'

type Props = {
  expenseId: string
  currentStatus: IAdminExpenseStatus
  userCapabilities: IAdminCapability[]
}

const NOTE_REQUIRED_FOR: IAdminExpenseStatus[] = ['rejected', 'needs_doc']

export function ExpenseStatusActions({ expenseId, currentStatus, userCapabilities }: Props) {
  const [pending, startTransition] = useTransition()
  const [noteDraftFor, setNoteDraftFor] = useState<IAdminExpenseStatus | null>(null)
  const [note, setNote] = useState('')

  const caps = new Set(userCapabilities)
  const available = EXPENSE_TRANSITIONS[currentStatus].filter((t) => caps.has(t.requires))

  if (available.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No hay acciones disponibles para el estado actual con tu rol.
      </div>
    )
  }

  function runTransition(next: IAdminExpenseStatus, noteValue?: string) {
    startTransition(async () => {
      try {
        await changeExpenseStatus({ expenseId, nextStatus: next, note: noteValue })
        toast.success('Estado actualizado')
        setNoteDraftFor(null)
        setNote('')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo cambiar el estado')
      }
    })
  }

  function handleClick(next: IAdminExpenseStatus) {
    if (NOTE_REQUIRED_FOR.includes(next)) {
      setNoteDraftFor(next)
      return
    }
    runTransition(next)
  }

  function submitNote() {
    if (!noteDraftFor) return
    if (!note.trim()) {
      toast.error('La nota es obligatoria para este estado')
      return
    }
    runTransition(noteDraftFor, note.trim())
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {available.map((t) => {
          const isDestructive = t.to === 'rejected'
          const isPrimary = t.to === 'approved' || t.to === 'imputed'
          return (
            <Button
              key={t.to}
              size="sm"
              variant={isDestructive ? 'destructive' : isPrimary ? 'default' : 'outline'}
              disabled={pending}
              onClick={() => handleClick(t.to)}
            >
              {t.label}
            </Button>
          )
        })}
      </div>

      {noteDraftFor ? (
        <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
          <Label htmlFor="status-note" className="text-xs">
            Motivo {noteDraftFor === 'rejected' ? 'del rechazo' : 'del pedido de documentacion'}
          </Label>
          <Textarea
            id="status-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Describi brevemente el motivo..."
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setNoteDraftFor(null)
                setNote('')
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" disabled={pending} onClick={submitNote}>
              Confirmar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
