'use client'

import { useMemo, useState, useTransition } from 'react'
import { ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle2, Clock, Pencil, Plus, Receipt, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type {
  IAdminCashAccountKind,
  IAdminCashAccountWithBalance,
  IAdminCashMovement,
  IAdminMovementKind,
  IAdminPayableExpense,
  IAdminPayableProviderGroup,
} from '@/lib/types'
import {
  addManualMovement,
  createCashAccount,
  payExpense,
  setCashAccountActive,
  updateCashAccount,
} from '@/app/iadmin/consorcios/[id]/cuentas/actions'

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n)
}

const MOVEMENT_KIND_LABELS: Record<IAdminMovementKind, string> = {
  manual: 'Manual',
  expense_payment: 'Pago de gasto',
  collection: 'Cobranza',
  transfer: 'Transferencia',
  adjustment: 'Ajuste',
  opening: 'Saldo inicial',
}

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

type Props = {
  propertyId: string
  accounts: IAdminCashAccountWithBalance[]
  movements: IAdminCashMovement[]
  payableGroups: IAdminPayableProviderGroup[]
  totalPayable: number
  canManage: boolean
}

type AccountDraft = {
  name: string
  kind: IAdminCashAccountKind
  bankName: string
  accountNumber: string
  cbu: string
  alias: string
}

const emptyDraft: AccountDraft = {
  name: '',
  kind: 'bank',
  bankName: '',
  accountNumber: '',
  cbu: '',
  alias: '',
}

function accountToDraft(a: IAdminCashAccountWithBalance): AccountDraft {
  return {
    name: a.name,
    kind: a.kind,
    bankName: a.bankName ?? '',
    accountNumber: a.accountNumber ?? '',
    cbu: a.cbu ?? '',
    alias: a.alias ?? '',
  }
}

export function CashAccountsManager({ propertyId, accounts, movements, payableGroups, totalPayable, canManage }: Props) {
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft)

  // Pago de una deuda a proveedor desde la sección "Proveedores a pagar".
  // Guardamos cuál gasto se está pagando + el form (cuenta/fecha/override).
  const defaultPayAccountId = accounts.find((a) => a.isActive)?.id ?? accounts[0]?.id ?? ''
  const [payingExpenseId, setPayingExpenseId] = useState<string | null>(null)
  const [payAccountId, setPayAccountId] = useState<string>(defaultPayAccountId)
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payOverdraftWarning, setPayOverdraftWarning] = useState<string | null>(null)
  const [payAllowOverdraft, setPayAllowOverdraft] = useState(false)

  function openPay(expenseId: string) {
    setPayingExpenseId(expenseId)
    setPayAccountId(defaultPayAccountId)
    setPayOverdraftWarning(null)
    setPayAllowOverdraft(false)
  }

  function closePay() {
    setPayingExpenseId(null)
    setPayOverdraftWarning(null)
    setPayAllowOverdraft(false)
  }

  function submitPay(expense: IAdminPayableExpense) {
    if (!payAccountId) {
      toast.error('Elegí una cuenta de pago')
      return
    }
    startTransition(async () => {
      const result = await payExpense({
        expenseId: expense.id,
        cashAccountId: payAccountId,
        movementDate: payDate,
        allowOverdraft: payAllowOverdraft,
      })
      if (result.ok) {
        toast.success('Pago registrado y deuda saldada')
        closePay()
        return
      }
      if (result.code === 'INSUFFICIENT_FUNDS') {
        setPayOverdraftWarning(result.error)
        return
      }
      toast.error(result.error)
    })
  }

  // Filtro del libro de movimientos por cuenta.
  const [ledgerAccountId, setLedgerAccountId] = useState<string>('')

  // Alta rápida de movimiento manual (ingreso/egreso suelto en una cuenta).
  const [movingAccountId, setMovingAccountId] = useState<string>('')
  const [moveSign, setMoveSign] = useState<'in' | 'out'>('out')
  const [moveDate, setMoveDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [moveDesc, setMoveDesc] = useState('')
  const [moveAmount, setMoveAmount] = useState('')
  // Override de saldo para egresos manuales que dejarían la cuenta en negativo.
  const [moveOverdraftWarning, setMoveOverdraftWarning] = useState<string | null>(null)
  const [moveAllowOverdraft, setMoveAllowOverdraft] = useState(false)

  const totalBalance = useMemo(
    () => accounts.reduce((s, a) => s + a.currentBalance, 0),
    [accounts],
  )

  const visibleMovements = useMemo(
    () => (ledgerAccountId ? movements.filter((m) => m.cashAccountId === ledgerAccountId) : movements),
    [movements, ledgerAccountId],
  )

  function submitManualMovement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const accountId = movingAccountId || accounts.find((a) => a.isActive)?.id || accounts[0]?.id
    if (!accountId) {
      toast.error('No hay cuentas cargadas')
      return
    }
    const raw = Number(moveAmount.replace(',', '.'))
    if (!Number.isFinite(raw) || raw <= 0) {
      toast.error('Monto inválido')
      return
    }
    if (!moveDesc.trim()) {
      toast.error('Descripción obligatoria')
      return
    }
    const signed = moveSign === 'out' ? -Math.abs(raw) : Math.abs(raw)
    startTransition(async () => {
      const result = await addManualMovement({
        cashAccountId: accountId,
        movementDate: moveDate,
        description: moveDesc.trim(),
        amount: signed,
        movementKind: 'manual',
        allowOverdraft: moveAllowOverdraft,
      })
      if (result.ok) {
        toast.success('Movimiento registrado')
        setMoveDesc('')
        setMoveAmount('')
        setMoveOverdraftWarning(null)
        setMoveAllowOverdraft(false)
        return
      }
      if (result.code === 'INSUFFICIENT_FUNDS') {
        setMoveOverdraftWarning(result.error)
        return
      }
      toast.error(result.error)
    })
  }

  function resetForm() {
    setDraft(emptyDraft)
    setCreating(false)
    setEditingId(null)
  }

  function submitAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.name.trim()) {
      toast.error('Nombre obligatorio')
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
          })
          toast.success('Cuenta creada y activada')
        }
        resetForm()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function handleActivate(accountId: string) {
    startTransition(async () => {
      try {
        await setCashAccountActive({ accountId, isActive: true })
        toast.success('Cuenta marcada como activa')
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

  const activeAccount = accounts.find((a) => a.isActive) ?? null

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border/40 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        Estas cuentas/CBU se usan para que los vecinos sepan dónde transferir.
        <b className="text-foreground"> Solo puede haber una activa por consorcio</b> — la activa se
        incluye automáticamente en el mensaje de cada liquidación.
      </div>

      {/* Total de caja: suma de saldos de todas las cuentas. */}
      {accounts.length > 0 ? (
        <div className="glass-card rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Total en caja</div>
              <div className="text-2xl font-bold text-foreground">{formatARS(totalBalance)}</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {accounts.length} {accounts.length === 1 ? 'cuenta' : 'cuentas'} · saldo en vivo según movimientos
          </div>
        </div>
      ) : null}

      {!activeAccount ? (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠ No hay ninguna cuenta activa. Cargá o activá una para poder emitir liquidaciones con
          datos de pago para los vecinos.
        </div>
      ) : null}

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
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear y activar cuenta'}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        {accounts.length === 0 ? (
          <div className="glass-card rounded-2xl px-5 py-12 text-center text-sm text-muted-foreground">
            No hay cuentas cargadas. {canManage ? 'Cargá la primera arriba.' : ''}
          </div>
        ) : (
          accounts.map((a) => (
            <div
              key={a.id}
              className={`glass-card rounded-2xl p-5 ${
                a.isActive ? 'border-2 border-emerald-300' : 'opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Banknote className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate flex items-center gap-2">
                      {a.name}
                      {a.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> activa
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {KIND_LABELS[a.kind]}
                      {a.bankName ? ` · ${a.bankName}` : ''}
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
                <div className="text-right shrink-0">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Saldo</div>
                  <div className={`text-lg font-bold ${a.currentBalance < 0 ? 'text-rose-600' : 'text-foreground'}`}>
                    {formatARS(a.currentBalance)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {a.movementsCount} {a.movementsCount === 1 ? 'movimiento' : 'movimientos'}
                  </div>
                </div>
              </div>

              {canManage ? (
                <div className="mt-3 flex flex-wrap gap-2 justify-end">
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => openEdit(a)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Editar
                  </Button>
                  {!a.isActive ? (
                    <Button size="sm" disabled={pending} onClick={() => handleActivate(a.id)}>
                      Marcar como activa
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {/* Proveedores a pagar: deuda pendiente agrupada por proveedor. */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Proveedores a pagar</h3>
              <p className="text-xs text-muted-foreground">
                Gastos aprobados o imputados que todavía no se pagaron.
              </p>
            </div>
          </div>
          {totalPayable > 0 ? (
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Deuda total</div>
              <div className="text-xl font-bold text-amber-700">{formatARS(totalPayable)}</div>
            </div>
          ) : null}
        </div>

        {payableGroups.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No hay deuda pendiente con proveedores. Todo al día 🎉
          </div>
        ) : (
          <div className="space-y-3">
            {payableGroups.map((group) => (
              <div
                key={group.providerId ?? 'no-provider'}
                className="rounded-lg border border-border/50 bg-muted/10 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/30 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{group.providerName}</div>
                    {group.oldestDate ? (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> Más antiguo: {group.oldestDate}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {group.expenses.length} {group.expenses.length === 1 ? 'gasto' : 'gastos'}
                    </div>
                    <div className="text-base font-bold text-foreground">{formatARS(group.totalAmount)}</div>
                  </div>
                </div>

                <div className="divide-y divide-border/30">
                  {group.expenses.map((expense) => (
                    <div key={expense.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="text-sm text-foreground truncate">{expense.description}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {expense.issuedAt ? expense.issuedAt : 'Sin fecha'}
                            {expense.category ? ` · ${expense.category}` : ''}
                            {expense.documentNumber ? ` · ${expense.documentType ?? 'Comp.'} ${expense.documentNumber}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-semibold text-foreground">{formatARS(expense.amount)}</span>
                          {canManage && payingExpenseId !== expense.id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending || accounts.length === 0}
                              onClick={() => openPay(expense.id)}
                            >
                              Registrar pago
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {canManage && payingExpenseId === expense.id ? (
                        <div className="mt-3 rounded-lg border border-border/50 bg-background p-3 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                            <div className="sm:col-span-6 space-y-1">
                              <Label className="text-[11px]">Pagar desde</Label>
                              <select
                                value={payAccountId}
                                onChange={(e) => {
                                  setPayAccountId(e.target.value)
                                  setPayOverdraftWarning(null)
                                  setPayAllowOverdraft(false)
                                }}
                                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                              >
                                {accounts.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} · {formatARS(a.currentBalance)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="sm:col-span-4 space-y-1">
                              <Label className="text-[11px]">Fecha</Label>
                              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="h-9" />
                            </div>
                            <div className="sm:col-span-2 flex sm:justify-end">
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={closePay}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>

                          {payOverdraftWarning ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
                              <p className="text-sm text-amber-900">{payOverdraftWarning}</p>
                              <label className="flex items-center gap-2 text-sm text-amber-900 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={payAllowOverdraft}
                                  onChange={(e) => setPayAllowOverdraft(e.target.checked)}
                                />
                                Permitir saldo negativo y registrar el pago igual
                              </label>
                            </div>
                          ) : null}

                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              disabled={pending || (payOverdraftWarning !== null && !payAllowOverdraft)}
                              onClick={() => submitPay(expense)}
                            >
                              {pending ? 'Registrando…' : payOverdraftWarning ? 'Forzar pago' : 'Confirmar pago'}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Libro de movimientos: caja dinámica con ingresos/egresos de las cuentas. */}
      {accounts.length > 0 ? (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-medium text-foreground">Libro de movimientos</h3>
            {accounts.length > 1 ? (
              <select
                value={ledgerAccountId}
                onChange={(e) => setLedgerAccountId(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="">Todas las cuentas</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            ) : null}
          </div>

          {/* Alta rápida de movimiento manual. */}
          {canManage ? (
            <form onSubmit={submitManualMovement} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end rounded-lg border border-border/50 bg-muted/20 p-3">
              <div className="sm:col-span-3 space-y-1">
                <Label className="text-[11px]">Cuenta</Label>
                <select
                  value={movingAccountId}
                  onChange={(e) => {
                    setMovingAccountId(e.target.value)
                    setMoveOverdraftWarning(null)
                    setMoveAllowOverdraft(false)
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-[11px]">Tipo</Label>
                <div className="flex rounded-md border border-input overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setMoveSign('out')}
                    className={`flex-1 px-2 py-1.5 text-xs ${moveSign === 'out' ? 'bg-rose-100 text-rose-800 font-medium' : 'text-muted-foreground'}`}
                  >
                    Egreso
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoveSign('in')
                      setMoveOverdraftWarning(null)
                      setMoveAllowOverdraft(false)
                    }}
                    className={`flex-1 px-2 py-1.5 text-xs ${moveSign === 'in' ? 'bg-emerald-100 text-emerald-800 font-medium' : 'text-muted-foreground'}`}
                  >
                    Ingreso
                  </button>
                </div>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-[11px]">Fecha</Label>
                <Input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} className="h-9" />
              </div>
              <div className="sm:col-span-3 space-y-1">
                <Label className="text-[11px]">Descripción</Label>
                <Input value={moveDesc} onChange={(e) => setMoveDesc(e.target.value)} placeholder="Ej: transferencia, gasto suelto…" className="h-9" />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-[11px]">Monto</Label>
                <Input inputMode="decimal" value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} placeholder="0.00" className="h-9" />
              </div>
              {moveOverdraftWarning ? (
                <div className="sm:col-span-12 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
                  <p className="text-sm text-amber-900">{moveOverdraftWarning}</p>
                  <label className="flex items-center gap-2 text-sm text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={moveAllowOverdraft}
                      onChange={(e) => setMoveAllowOverdraft(e.target.checked)}
                    />
                    Permitir saldo negativo y registrar el egreso igual
                  </label>
                </div>
              ) : null}
              <div className="sm:col-span-12 flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending || (moveOverdraftWarning !== null && !moveAllowOverdraft)}
                >
                  {pending ? 'Guardando…' : moveOverdraftWarning ? 'Forzar egreso' : 'Registrar movimiento'}
                </Button>
              </div>
            </form>
          ) : null}

          {visibleMovements.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Todavía no hay movimientos. Los pagos de gastos y cobranzas aparecen acá automáticamente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border/50">
                    <th className="py-2 pr-2 font-medium">Fecha</th>
                    <th className="py-2 pr-2 font-medium">Cuenta</th>
                    <th className="py-2 pr-2 font-medium">Concepto</th>
                    <th className="py-2 pr-2 font-medium">Tipo</th>
                    <th className="py-2 pl-2 font-medium text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMovements.map((m) => (
                    <tr key={m.id} className="border-b border-border/30">
                      <td className="py-2 pr-2 whitespace-nowrap text-muted-foreground">{m.movementDate}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">{m.cashAccountName ?? '—'}</td>
                      <td className="py-2 pr-2">{m.description ?? m.expenseDescription ?? '—'}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                          {MOVEMENT_KIND_LABELS[m.movementKind] ?? m.movementKind}
                        </span>
                      </td>
                      <td className={`py-2 pl-2 text-right whitespace-nowrap font-medium ${m.amount < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {m.amount < 0 ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {formatARS(m.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
