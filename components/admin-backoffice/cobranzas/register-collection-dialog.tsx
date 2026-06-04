'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Money } from '@/components/admin-backoffice/shared/money'
import { RegisterCollectionForm } from '@/components/admin-backoffice/cobranzas/register-collection-form'
import type { IAdminCashAccountWithBalance, IAdminOpenLiquidationItem } from '@/lib/types'

interface Props {
  eligibleItems: IAdminOpenLiquidationItem[]
  cashAccounts: IAdminCashAccountWithBalance[]
}

const MONTH_LABELS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

export function RegisterCollectionDialog({ eligibleItems, cashAccounts }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const accountsByProperty = useMemo(() => {
    const map = new Map<string, IAdminCashAccountWithBalance[]>()
    for (const a of cashAccounts) {
      const arr = map.get(a.managedPropertyId) ?? []
      arr.push(a)
      map.set(a.managedPropertyId, arr)
    }
    return map
  }, [cashAccounts])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return eligibleItems
    return eligibleItems.filter((it) => {
      const haystack = [
        it.unitCode,
        it.holderName ?? '',
        it.propertyDisplayName ?? '',
        it.buildingName ?? '',
        `${String(it.periodMonth).padStart(2, '0')}/${it.periodYear}`,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [eligibleItems, search])

  const selected = useMemo(
    () => eligibleItems.find((it) => it.itemId === selectedItemId) ?? null,
    [eligibleItems, selectedItemId],
  )

  function close() {
    setOpen(false)
    setSearch('')
    setSelectedItemId(null)
  }

  function onDone() {
    close()
    router.refresh()
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} className="gap-2" disabled={eligibleItems.length === 0}>
        <Plus className="h-4 w-4" />
        Registrar cobranza
      </Button>
    )
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-2" disabled>
        <Plus className="h-4 w-4" />
        Registrar cobranza
      </Button>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={close}
      >
        <div
          className="glass-card w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-serif text-xl font-bold text-foreground">Registrar cobranza</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Elegí la liquidación a la que corresponde el pago.
              </p>
            </div>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={close}
            >
              ✕
            </button>
          </div>

          {!selected ? (
            <ItemPicker
              items={filteredItems}
              search={search}
              setSearch={setSearch}
              onPick={(id) => setSelectedItemId(id)}
            />
          ) : (
            <SelectedItemForm
              item={selected}
              cashAccounts={accountsByProperty.get(selected.managedPropertyId) ?? []}
              onBack={() => setSelectedItemId(null)}
              onDone={onDone}
            />
          )}
        </div>
      </div>
    </>
  )
}

function ItemPicker({
  items,
  search,
  setSearch,
  onPick,
}: {
  items: IAdminOpenLiquidationItem[]
  search: string
  setSearch: (s: string) => void
  onPick: (id: string) => void
}) {
  if (items.length === 0 && !search) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
        No hay liquidaciones con saldo abierto. Emití una liquidación o aboná los saldos
        existentes para que aparezcan acá.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por unidad, propietario, período…"
          className="pl-9"
        />
      </div>

      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border/40 divide-y divide-border/40">
        {items.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Sin resultados para "{search}".
          </div>
        ) : (
          items.map((it) => {
            const monthLabel = MONTH_LABELS[it.periodMonth - 1] ?? `mes ${it.periodMonth}`
            const propertyName = it.propertyDisplayName ?? it.buildingName ?? 'Consorcio'
            return (
              <button
                key={it.itemId}
                type="button"
                onClick={() => onPick(it.itemId)}
                className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-foreground truncate">
                      {it.unitCode}
                      {it.holderName ? <span className="text-muted-foreground font-normal"> · {it.holderName}</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {propertyName} · {monthLabel} {it.periodYear}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-foreground">
                      <Money amount={it.balanceRemaining} />
                    </div>
                    <div className="text-[10px] text-muted-foreground">pendiente</div>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function SelectedItemForm({
  item,
  cashAccounts,
  onBack,
  onDone,
}: {
  item: IAdminOpenLiquidationItem
  cashAccounts: IAdminCashAccountWithBalance[]
  onBack: () => void
  onDone: () => void
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Cambiar liquidación
      </button>
      <RegisterCollectionForm
        itemId={item.itemId}
        unitCode={item.unitCode}
        holderName={item.holderName}
        subtotal={item.subtotal}
        balanceRemaining={item.balanceRemaining}
        dueDates={item.dueDates}
        cashAccounts={cashAccounts}
        onDone={onDone}
      />
    </div>
  )
}
