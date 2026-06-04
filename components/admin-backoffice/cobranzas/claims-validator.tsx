'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, FileText, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/admin-backoffice/shared/money'
import type { IAdminCashAccountWithBalance } from '@/lib/types'
import {
  rejectPaymentClaim,
  validatePaymentClaim,
} from '@/app/iadmin/cobranzas/actions'

export interface ClaimRowView {
  id: string
  unitCode: string
  reporterName: string | null
  reporterEmail: string | null
  amount: number
  paidAtClaimed: string
  method: string | null
  reference: string | null
  notes: string | null
  hasDocument: boolean
  liquidationItemId: string | null
  liquidationPeriod: string | null
  createdAt: string
}

type Props = {
  claims: ClaimRowView[]
  cashAccounts: IAdminCashAccountWithBalance[]
  canValidate: boolean
}

export function ClaimsValidator({ claims, cashAccounts, canValidate }: Props) {
  const [pending, startTransition] = useTransition()
  const [accountByClaim, setAccountByClaim] = useState<Record<string, string>>(
    Object.fromEntries(claims.map((c) => [c.id, cashAccounts.find((a) => a.isActive)?.id ?? ''])),
  )
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  function handleValidate(claim: ClaimRowView) {
    const cashAccountId = accountByClaim[claim.id]
    if (!cashAccountId) {
      toast.error('Elegí una cuenta')
      return
    }
    if (!claim.liquidationItemId) {
      toast.error('El reporte no está asociado a una liquidación — registrá el pago manualmente')
      return
    }
    startTransition(async () => {
      try {
        const { receiptNumber } = await validatePaymentClaim({
          claimId: claim.id,
          cashAccountId,
        })
        toast.success(`Pago validado · recibo ${receiptNumber}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo validar')
      }
    })
  }

  function handleReject(claimId: string) {
    if (!rejectReason.trim()) {
      toast.error('Indicá el motivo del rechazo')
      return
    }
    startTransition(async () => {
      try {
        await rejectPaymentClaim({ claimId, reason: rejectReason.trim() })
        toast.success('Reporte rechazado')
        setRejectingId(null)
        setRejectReason('')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo rechazar')
      }
    })
  }

  if (claims.length === 0) {
    return (
      <div className="glass-card rounded-2xl px-5 py-12 text-center text-sm text-muted-foreground">
        No hay reportes de pago pendientes de validar.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {claims.map((claim) => (
        <div key={claim.id} className="glass-card rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground">Unidad {claim.unitCode}</span>
                {claim.liquidationPeriod ? (
                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {claim.liquidationPeriod}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {claim.reporterName ?? 'Vecino'}
                {claim.reporterEmail ? ` · ${claim.reporterEmail}` : ''}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Pagó el {claim.paidAtClaimed}
                {claim.method ? ` · ${claim.method}` : ''}
                {claim.reference ? ` · ref. ${claim.reference}` : ''}
              </div>
              {claim.notes ? (
                <div className="text-xs text-foreground mt-2 rounded bg-muted/30 px-2 py-1">
                  {claim.notes}
                </div>
              ) : null}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Monto reportado</div>
              <div className="font-serif text-xl font-bold tabular-nums text-foreground">
                <Money amount={claim.amount} />
              </div>
              {claim.hasDocument ? (
                <a
                  href={`/api/downloads/payment-claim-document?claimId=${claim.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <FileText className="w-3 h-3" />
                  Ver comprobante
                </a>
              ) : (
                <div className="mt-2 text-[10px] text-amber-700">Sin comprobante adjunto</div>
              )}
            </div>
          </div>

          {canValidate && rejectingId !== claim.id ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-border/30 pt-3">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Acreditar en cuenta
                </label>
                <select
                  value={accountByClaim[claim.id] ?? ''}
                  onChange={(e) =>
                    setAccountByClaim({ ...accountByClaim, [claim.id]: e.target.value })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                >
                  <option value="">— elegí cuenta —</option>
                  {cashAccounts
                    .filter((a) => a.isActive)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </div>
              <Button size="sm" disabled={pending} onClick={() => handleValidate(claim)}>
                {pending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                )}
                Validar y registrar pago
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setRejectingId(claim.id)
                  setRejectReason('')
                }}
              >
                <XCircle className="w-3.5 h-3.5 mr-1.5" />
                Rechazar
              </Button>
            </div>
          ) : null}

          {rejectingId === claim.id ? (
            <div className="border-t border-border/30 pt-3 space-y-2">
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                Motivo del rechazo
              </label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Comprobante ilegible / monto incorrecto / etc."
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRejectingId(null)
                    setRejectReason('')
                  }}
                >
                  Cancelar
                </Button>
                <Button size="sm" disabled={pending} onClick={() => handleReject(claim.id)}>
                  Confirmar rechazo
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
