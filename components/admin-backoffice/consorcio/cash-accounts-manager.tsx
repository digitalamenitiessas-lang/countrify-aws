'use client'

import { useState, useTransition } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Banknote, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Money } from '@/components/admin-backoffice/shared/money'
import type { IAdminCashAccountKind, IAdminCashAccountWithBalance, IAdminCashMovement } from '@/lib/types'
import {
  addManualMovement,
  createCashAccount,
  setCashAccountActive,
  updateCashAccount,
} from '@/app/iadmin/consorcios/[id]/cuentas/actions'

const KIND_OPTIONS: Array<{ value: IAdminCashAccountKind; label: string }> = [
  { value: 'bank', label: 'Banco' },
  { value: 'cash', label: 'Caja chica' },
  { value: 'reserve', label: 'Fondo de reserva' },
  { value: 'other', label: 'Otra' },
]

const KIND_LABELS: Record<IAdminCashAccountKind, string> = {
  bank: 'Banco',
  cash: 'Caja',
  reserve: 'Reserva',
  other: 'Otra',
}

const MOVEMENT_KIND_LABEL: Record<IAdminCashMovement['movementKind'], string> = {
  manual: 'Manual',
  expense_payment: 'Pago a proveedor',
  collection: 'Cobranza',
  transfer: 'Transferencia',
  adjustment: 'Ajuste',
  opening: 'Saldo apertura',
}

type Props = {
  propertyId: string
  accounts: IAdminCashAccountWithBalance[]
  movements: IAdminCashMovement[]
  canManage: boolean
}

type AccountDraft = {
  name: string
  kind: IAdminCashAccountKind
  bankName: string
  accountNumber: string
  cbu: string
  alias: string
  openingBalance: string
  openingBalanceAt: string
  notes: string
}

const emptyDraft: AccountDraft = {
  name: '',
  kind: 'bank',
  bankName: '',
  accountNumber: '',
  cbu: '',
  alias: '',
  openingBalance: '',
  openingBalanceAt: '',
  notes: '',
}

function accountToDraft(a: IAdminCashAccountWithBalance): AccountDraft {
  return {
    name: a.name,
    kind: a.kind,
    bankName: a.bankName ?? '',
    accountNumber: a.accountNumber ?? '',
    cbu: a.cbu ?? '',
    alias: a.alias ?? '',
    openingBalance: '',
    openingBalanceAt: '',
    notes: a.notes ?? '',
  }
}

export function CashAccountsManager({ propertyId, accounts, movements, canManage }: Props) {
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft)

  // Movimiento manual
  const [movementFor, setMovementFor] = useState<string | null>(null)
  const [movDate, setMovDate] = useState(new Date().toISOString().slice(0, 10))
  const [movDescription, setMovDescription] = useState('')
  const [movAmount, setMovAmount] = useState('')
  const [movDirection, setMovDirection] = useState<'in' | 'out'>('in')
  const [movRef, setMovRef] = useState('')

  const totalBalance = accounts.filter((a) => a.isActive).reduce((s, a) => s + a.currentBalance, 0)

  function resetForm() {
    setDraft(emptyDraft)
    setCreating(false)
    setEditingId(null)
  }

  function resetMovement() {
    setMovementFor(null)
    setMovDate(new Date().toISOString().slice(0, 10))
    setMovDescription('')
    setMovAmount('')
    setMovDirection('in')
    setMovRef('')
  }

  function submitAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.name.trim()) {
      toast.error('Nombre obligatorio')
      return
    }
    const openingBalance = draft.openingBalance.trim()
      ? Number(draft.openingBalance.replace(',', '.'))
      : 0
    if (!Number.isFinite(openingBalance)) {
      toast.error('Saldo de apertura invalido')
      return
    }

    startTransition(async () => {
      try {
        if (editingId) {
          await updateCashAccount({
            accountId: editingId,
            name: draft.name,
            kind: draft.kind,
            bankName: draft.bankName || null,
            accountNumber: draft.accountNumber || null,
            cbu: draft.cbu || null,
            alias: draft.alias || null,
            notes: draft.notes || null,
          })
          toast.success('Cuenta actualizada')
        } else {
          await createCashAccount({
            propertyId,
            name: draft.name,
            kind: draft.kind,
            bankName: draft.bankName || null,
            accountNumber: draft.accountNumber || null,
            cbu: draft.cbu || null,
            alias: draft.alias || null,
            openingBalance,
            openingBalanceAt: draft.openingBalanceAt || null,
            notes: draft.notes || null,
          })
          toast.success('Cuenta creada')
        }
        resetForm()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function submitMovement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!movementFor) return
    const amt = Number(movAmount.replace(',', '.'))
    if (!Number.isFinite(amt) || amt === 0) {
      toast.error('Monto invalido')
      return
    }
    const signed = movDirection === 'in' ? Math.abs(amt) : -Math.abs(amt)
    if (!movDescription.trim()) {
      toast.error('Descripcion obligatoria')
      return
    }

    startTransition(async () => {
      try {
        await addManualMovement({
          cashAccountId: movementFor,
          movementDate: movDate,
          description: movDescription.trim(),
          amount: signed,
          externalRef: movRef.trim() || undefined,
        })
        toast.success('Movimiento registrado')
        resetMovement()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function handleToggle(accountId: string, next: boolean) {
    startTransition(async () => {
      try {
        await setCashAccountActive({ accountId, isActive: next })
        toast.success(next ? 'Cuenta activada' : 'Cuenta archivada')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function openEdit(a: IAdminCashAccountWithBalance) {
    setDraft(accountToDraft(a))
    setEditingId(a.id)
    setCreating(false)
  }

  return (
    <div className="space-y-6">
      {/* Resumen cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Saldo total</div>
          <div className={`font-serif text-2xl font-bold tabular-nums mt-1 ${totalBalance < 0 ? 'text-rose-700' : 'text-foreground'}`}>
            <Money amount={totalBalance} />
          </div>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Cuentas activas</div>
          <div className="font-serif text-2xl font-bold tabular-nums mt-1 text-foreground">
            {accounts.filter((a) => a.isActive).length}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Movimientos (ultimos 100)</div>
          <div className="font-serif text-2xl font-bold tabular-nums mt-1 text-foreground">
            {movements.length}
          </div>
        </div>
      </div>

      {canManage && !creating && !editingId ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Nueva cuenta
          </Button>
        </div>
      ) : null}

      {(creating || editingId) && canManage ? (
        <form onSubmit={submitAccount} className="glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">
              {editingId ? 'Editar cuenta' : 'Nueva cuenta'}
            </h3>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={resetForm}>
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Banco Galicia - CC" required />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as IAdminCashAccountKind })}
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Input value={draft.bankName} onChange={(e) => setDraft({ ...draft, bankName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Nº de cuenta</Label>
              <Input value={draft.accountNumber} onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>CBU</Label>
              <Input value={draft.cbu} onChange={(e) => setDraft({ ...draft, cbu: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Alias</Label>
              <Input value={draft.alias} onChange={(e) => setDraft({ ...draft, alias: e.target.value })} />
            </div>
            {!editingId ? (
              <>
                <div className="space-y-1.5">
                  <Label>Saldo de apertura</Label>
                  <Input inputMode="decimal" value={draft.openingBalance} onChange={(e) => setDraft({ ...draft, openingBalance: e.target.value })} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha de apertura</Label>
                  <Input type="date" value={draft.openingBalanceAt} onChange={(e) => setDraft({ ...draft, openingBalanceAt: e.target.value })} />
                </div>
              </>
            ) : null}
            <div className="space-y-1.5 md:col-span-2">
              <Label>Notas</Label>
              <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear cuenta'}
            </Button>
          </div>
        </form>
      ) : null}

      {/* Lista de cuentas */}
      <div className="grid grid-cols-1 gap-3">
        {accounts.length === 0 ? (
          <div className="glass-card rounded-2xl px-5 py-12 text-center text-sm text-muted-foreground">
            No hay cuentas cargadas. {canManage ? 'Cargá la primera arriba.' : ''}
          </div>
        ) : (
          accounts.map((a) => (
            <div
              key={a.id}
              className={`glass-card rounded-2xl p-5 ${a.isActive ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Banknote className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {KIND_LABELS[a.kind]}
                      {a.bankName ? ` · ${a.bankName}` : ''}
                      {!a.isActive ? ' · archivada' : ''}
                    </div>
                    {a.cbu || a.alias || a.accountNumber ? (
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {a.accountNumber ? `Cuenta: ${a.accountNumber} · ` : ''}
                        {a.cbu ? `CBU: ${a.cbu} · ` : ''}
                        {a.alias ? `Alias: ${a.alias}` : ''}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo actual</div>
                  <div className={`font-serif text-xl font-bold tabular-nums ${a.currentBalance < 0 ? 'text-rose-700' : 'text-foreground'}`}>
                    <Money amount={a.currentBalance} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {a.movementsCount} movimiento{a.movementsCount === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              {canManage ? (
                <div className="mt-3 flex flex-wrap gap-2 justify-end">
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => openEdit(a)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setMovementFor(a.id)
                      setMovDirection('in')
                    }}
                  >
                    <ArrowUpCircle className="w-3.5 h-3.5 mr-1" />
                    Nuevo movimiento
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => handleToggle(a.id, !a.isActive)}>
                    {a.isActive ? 'Archivar' : 'Reactivar'}
                  </Button>
                </div>
              ) : null}

              {movementFor === a.id ? (
                <form onSubmit={submitMovement} className="mt-4 rounded-lg border border-border/40 p-4 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Nuevo movimiento en {a.name}</h4>
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={resetMovement}>
                      Cancelar
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label>Fecha</Label>
                      <Input type="date" value={movDate} onChange={(e) => setMovDate(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Monto</Label>
                      <Input inputMode="decimal" value={movAmount} onChange={(e) => setMovAmount(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Direccion</Label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setMovDirection('in')}
                          className={`flex-1 flex items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-xs ${
                            movDirection === 'in' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'border-input'
                          }`}
                        >
                          <ArrowUpCircle className="w-3.5 h-3.5" /> Ingreso
                        </button>
                        <button
                          type="button"
                          onClick={() => setMovDirection('out')}
                          className={`flex-1 flex items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-xs ${
                            movDirection === 'out' ? 'bg-rose-50 border-rose-300 text-rose-800' : 'border-input'
                          }`}
                        >
                          <ArrowDownCircle className="w-3.5 h-3.5" /> Egreso
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Ref. externa</Label>
                      <Input value={movRef} onChange={(e) => setMovRef(e.target.value)} placeholder="Ej. 00001234" />
                    </div>
                    <div className="space-y-1.5 col-span-2 md:col-span-4">
                      <Label>Descripcion</Label>
                      <Input value={movDescription} onChange={(e) => setMovDescription(e.target.value)} placeholder="Transferencia recibida de..." required />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={pending}>
                      Registrar movimiento
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          ))
        )}
      </div>

      {/* Historial de movimientos */}
      <section className="glass-card rounded-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-border/40">
          <h3 className="font-serif text-lg font-semibold text-foreground">Movimientos recientes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ultimos 100 movimientos de todas las cuentas del consorcio.
          </p>
        </header>
        {movements.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Sin movimientos todavia.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
                <th className="text-left px-5 py-3 font-medium">Fecha</th>
                <th className="text-left px-5 py-3 font-medium">Cuenta</th>
                <th className="text-left px-5 py-3 font-medium">Descripcion</th>
                <th className="text-left px-5 py-3 font-medium">Tipo</th>
                <th className="text-right px-5 py-3 font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-border/30 last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-2.5 tabular-nums text-muted-foreground">{m.movementDate}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">{m.cashAccountName ?? '—'}</td>
                  <td className="px-5 py-2.5 text-foreground">{m.description ?? '—'}</td>
                  <td className="px-5 py-2.5">
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                      {MOVEMENT_KIND_LABEL[m.movementKind]}
                    </span>
                  </td>
                  <td className={`px-5 py-2.5 text-right tabular-nums font-medium ${m.amount < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    <Money amount={m.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
