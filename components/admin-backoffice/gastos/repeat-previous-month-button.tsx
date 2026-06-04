'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CopyPlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { repeatPreviousMonthExpenses } from '@/app/iadmin/gastos/actions'

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function monthLabel(year: number, month: number) {
  return `${MONTHS_ES[month - 1]} ${year}`
}

type Props = {
  managedPropertyId: string
  targetYear: number
  targetMonth: number
  /** Si el período destino ya tiene gastos cargados, se ofrece sumar o reemplazar. */
  targetHasExpenses: boolean
  variant?: 'default' | 'outline'
  size?: 'sm' | 'default'
  className?: string
}

export function RepeatPreviousMonthButton({
  managedPropertyId,
  targetYear,
  targetMonth,
  targetHasExpenses,
  variant = 'outline',
  size = 'sm',
  className,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  const prev = new Date(targetYear, targetMonth - 2, 1)
  const prevLabel = monthLabel(prev.getFullYear(), prev.getMonth() + 1)
  const targetLabel = monthLabel(targetYear, targetMonth)

  async function run(mode: 'add' | 'replace') {
    setPending(true)
    try {
      const result = await repeatPreviousMonthExpenses({
        managedPropertyId,
        targetYear,
        targetMonth,
        mode,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.copied === 0 && result.replaced === 0) {
        toast.info(`Ya tenías cargados todos los rubros de ${prevLabel}. No se agregó nada.`)
        setOpen(false)
        return
      }
      const replacedNote =
        result.replaced > 0 ? ` · ${result.replaced} reemplazado${result.replaced === 1 ? '' : 's'}` : ''
      toast.success(
        `${result.copied} gasto${result.copied === 1 ? '' : 's'} agregado${result.copied === 1 ? '' : 's'} de ${prevLabel}${replacedNote}`,
      )
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('No se pudieron repetir los gastos')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <CopyPlus className="w-3.5 h-3.5 mr-1.5" />
        Repetir gastos del mes anterior
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => (!pending ? setOpen(o) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Repetir gastos de {prevLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              {targetHasExpenses ? (
                <>
                  El período <strong>{targetLabel}</strong> ya tiene gastos cargados.{' '}
                  <strong>Sumar</strong> mantiene tus gastos y agrega sólo los rubros de {prevLabel}{' '}
                  que todavía no cargaste. <strong>Reemplazar</strong> borra lo cargado este mes y
                  copia todo desde {prevLabel}.
                </>
              ) : (
                <>
                  Se copiarán los gastos de <strong>{prevLabel}</strong> al período{' '}
                  <strong>{targetLabel}</strong> con los mismos proveedores y montos. Después vas a
                  poder editar cada uno.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <AlertDialogCancel disabled={pending} className="w-full sm:w-auto">
              Cancelar
            </AlertDialogCancel>
            {targetHasExpenses ? (
              <>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => run('replace')}
                  className="w-full sm:w-auto"
                >
                  {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reemplazar'}
                </Button>
                <Button
                  disabled={pending}
                  onClick={() => run('add')}
                  className="w-full sm:w-auto"
                >
                  {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sumar a los actuales'}
                </Button>
              </>
            ) : (
              <Button disabled={pending} onClick={() => run('add')} className="w-full sm:w-auto">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Repetir gastos'}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
