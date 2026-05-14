'use client'

import { useState, useTransition } from 'react'
import { Loader2, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/admin-backoffice/shared/money'
import { cloneRecurringExpenses, type CloneRecurringResult } from '@/app/iadmin/gastos/recurring-actions'

export function CloneRecurringButton({
  propertyId,
  recurringCount,
}: {
  propertyId: string
  recurringCount: number
}) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<CloneRecurringResult | null>(null)

  if (recurringCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 mb-1">
          <Repeat className="w-4 h-4 text-primary" />
          <span className="font-medium text-foreground">Gastos recurrentes</span>
        </div>
        Marcá proveedores como "recurrentes" desde Proveedores y los vas a poder clonar acá cada mes con 1 click.
      </div>
    )
  }

  function handleClone() {
    startTransition(async () => {
      try {
        const r = await cloneRecurringExpenses({ propertyId })
        setResult(r)
        if (r.created > 0) {
          toast.success(`${r.created} gastos clonados por ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(r.totalAmount)}`)
        } else {
          toast.info('No se creó ningún gasto nuevo')
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Repeat className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-foreground">Gastos recurrentes del mes</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {recurringCount} proveedor{recurringCount === 1 ? '' : 'es'} marcado{recurringCount === 1 ? '' : 's'} como recurrente. Usa el monto de su ultimo gasto (o el monto tipico).
            </div>
          </div>
        </div>
        <Button onClick={handleClone} disabled={pending} size="sm">
          {pending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Clonando…
            </>
          ) : (
            <>
              <Repeat className="w-3.5 h-3.5 mr-1.5" />
              Cargar gastos del mes
            </>
          )}
        </Button>
      </div>

      {result ? (
        <div className="mt-3 rounded-lg bg-background border border-border/40 p-3 text-sm space-y-2">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Creados</div>
              <div className="font-serif text-lg font-bold text-emerald-700 tabular-nums">{result.created}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total imputado</div>
              <div className="font-serif text-lg font-bold text-foreground tabular-nums">
                <Money amount={result.totalAmount} />
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Salteados</div>
              <div className="font-serif text-lg font-bold text-amber-700 tabular-nums">{result.skipped.length}</div>
            </div>
          </div>
          {result.skipped.length > 0 ? (
            <ul className="text-xs text-muted-foreground list-disc ml-4 space-y-0.5">
              {result.skipped.slice(0, 5).map((s, idx) => (
                <li key={idx}>
                  <span className="font-medium text-foreground">{s.providerName}</span>: {s.reason}
                </li>
              ))}
              {result.skipped.length > 5 ? <li>…y {result.skipped.length - 5} más</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
