'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ChevronRight, FileSpreadsheet, Info, Loader2, Lock, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type {
  IAdminCapability,
  IAdminCashAccountWithBalance,
  IAdminMesaState,
  IAdminMonthlyGrid,
  IAdminMonthlyGridRow,
} from '@/lib/types'
import {
  emitAndNotify,
  quickPayFromMesa,
  type EmitAndNotifyResult,
  upsertMonthlyCell,
} from '@/app/iadmin/consorcios/[id]/planilla/actions'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PublishDialog } from '@/components/admin-backoffice/consorcio/publish-dialog'
import { MesaDistribution } from '@/components/admin-backoffice/consorcio/mesa-distribution'
import { MesaPayments } from '@/components/admin-backoffice/consorcio/mesa-payments'
import { MesaHeader } from '@/components/admin-backoffice/consorcio/mesa-header'
import { MesaPreviousRecap } from '@/components/admin-backoffice/consorcio/mesa-previous-recap'
import { CellHistoryPopover } from '@/components/admin-backoffice/consorcio/cell-history-popover'
import {
  MesaBatchBar,
  applyDeltaToAmount,
  type DeltaModifier,
} from '@/components/admin-backoffice/consorcio/mesa-batch-bar'
import { Sparkline } from '@/components/admin-backoffice/shared/sparkline'
import { useHotkeys } from '@/components/admin-backoffice/shared/use-hotkeys'
import { useLocalPref } from '@/components/admin-backoffice/shared/use-local-pref'
import { SavedIndicator } from '@/components/admin-backoffice/shared/saved-indicator'
import { HistoryIndicator } from '@/components/admin-backoffice/shared/history-indicator'
import { detectCellAnomaly, type CellAnomaly } from '@/components/admin-backoffice/shared/anomaly'
import { EmptyState } from '@/components/admin-backoffice/shared/empty-state'
import { RepeatPreviousMonthButton } from '@/components/admin-backoffice/gastos/repeat-previous-month-button'
import { LiquidationStateButton } from '@/components/admin-backoffice/consorcio/liquidation-state-button'

type Props = {
  grid: IAdminMonthlyGrid
  state: IAdminMesaState
  previousState?: IAdminMesaState | null
  cashAccounts: IAdminCashAccountWithBalance[]
  canEmit: boolean
  canManageRubros: boolean
  canRegisterPayments: boolean
  /** Capabilities de liquidación del usuario, para gestionar estados (Cerrar/Reabrir). */
  liquidationCaps: IAdminCapability[]
}

type VisibleRange = 3 | 6 | 12

const MONTH_SHORT_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function formatARSShort(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
}

function cellKey(providerId: string, year: number, month: number) {
  return `${providerId}::${year}-${month}`
}

// --- Undo/redo model -------------------------------------------------------

type CellChange = {
  providerId: string
  providerName: string
  expenseKind: 'ordinaria' | 'extraordinaria'
  year: number
  month: number
  previous: number | null
  next: number | null
}

type HistoryEntry = {
  id: string
  label: string
  at: number
  changes: CellChange[]
}

const HISTORY_CAP = 30

function describeChange(changes: CellChange[]): string {
  if (changes.length === 0) return 'Edición'
  if (changes.length === 1) {
    const c = changes[0]
    return `${c.providerName} · ${MONTH_SHORT_ES[c.month - 1]} ${String(c.year).slice(2)}`
  }
  return `${changes.length} celdas`
}

export function MonthlyPlanilla({
  grid,
  state,
  previousState,
  cashAccounts,
  canEmit,
  canManageRubros,
  canRegisterPayments,
  liquidationCaps,
}: Props) {
  const router = useRouter()

  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editSeed, setEditSeed] = useState<string | null>(null)
  const [localValues, setLocalValues] = useState<Record<string, number | null>>({})
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set())
  const [savedCells, setSavedCells] = useState<Set<string>>(new Set())
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [_, startTransition] = useTransition()

  const [reissueDialogOpen, setReissueDialogOpen] = useState(false)

  const [publishResult, setPublishResult] = useState<EmitAndNotifyResult | null>(null)
  const [publishing, setPublishing] = useState(false)

  // Rango visible persistido (3 / 6 / 12)
  const [visibleRange, setVisibleRange] = useLocalPref<VisibleRange>('mesa.visibleRange', 3)

  // Matrix de refs para navegación por teclado
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map())
  function registerCellRef(rowIdx: number, monthIdx: number, el: HTMLTableCellElement | null) {
    const k = `${rowIdx}-${monthIdx}`
    if (el) cellRefs.current.set(k, el)
    else cellRefs.current.delete(k)
  }

  // Selección múltiple: Set de `${rowIdx}-${monthIdx}` + anchor para shift-extend
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<{ r: number; m: number } | null>(null)

  // Undo / Redo
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([])

  function rectSelection(a: { r: number; m: number }, b: { r: number; m: number }): Set<string> {
    const r0 = Math.min(a.r, b.r)
    const r1 = Math.max(a.r, b.r)
    const m0 = Math.min(a.m, b.m)
    const m1 = Math.max(a.m, b.m)
    const out = new Set<string>()
    for (let r = r0; r <= r1; r++) {
      for (let m = m0; m <= m1; m++) {
        out.add(`${r}-${m}`)
      }
    }
    return out
  }

  function clearSelection() {
    setSelection(new Set())
    setSelectionAnchor(null)
  }

  // Agrupación persistida (la búsqueda inline se removió junto con el
  // header de la planilla; `search` queda como literal vacío para que los
  // checks `search.trim()` repartidos en el render siempre den false).
  const [groupBy, setGroupBy] = useLocalPref<'none' | 'category'>('mesa.groupBy', 'none')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const search = ''

  const visibleMonths = useMemo(() => {
    const take = Math.min(visibleRange, grid.months.length)
    return grid.months.slice(-take)
  }, [grid.months, visibleRange])

  const currentMonth = grid.months[grid.months.length - 1]

  function getDisplayAmount(row: IAdminMonthlyGridRow, year: number, month: number): number | null {
    const key = cellKey(row.providerId, year, month)
    if (key in localValues) return localValues[key]
    const cell = row.cells.find((c) => c.year === year && c.month === month)
    return cell?.amount ?? null
  }

  function pushHistory(changes: CellChange[], label: string) {
    if (changes.length === 0) return
    const entry: HistoryEntry = {
      id: Math.random().toString(36).slice(2),
      label,
      at: Date.now(),
      changes,
    }
    setHistory((prev) => [...prev, entry].slice(-HISTORY_CAP))
    setRedoStack([])
  }

  async function commitCell(
    row: IAdminMonthlyGridRow,
    year: number,
    month: number,
    nextAmount: number | null,
    opts?: { collect?: CellChange[]; skipHistory?: boolean; label?: string },
  ) {
    const key = cellKey(row.providerId, year, month)
    const previous = getDisplayAmount(row, year, month)
    if (previous === nextAmount) return

    setPendingCells((prev) => new Set(prev).add(key))
    setLocalValues((prev) => ({ ...prev, [key]: nextAmount }))

    startTransition(async () => {
      try {
        await upsertMonthlyCell({
          propertyId: grid.propertyId,
          providerId: row.providerId || null,
          year,
          month,
          amount: nextAmount,
          expenseKind: row.expenseKind,
        })
        // Feedback sutil: pulse verde breve + timestamp global
        setSavedCells((prev) => new Set(prev).add(key))
        setLastSavedAt(new Date())
        setTimeout(() => {
          setSavedCells((prev) => {
            const next = new Set(prev)
            next.delete(key)
            return next
          })
        }, 900)
        // Registrar en history (o en collector externo)
        const change: CellChange = {
          providerId: row.providerId,
          providerName: row.providerName,
          expenseKind: row.expenseKind,
          year,
          month,
          previous,
          next: nextAmount,
        }
        if (opts?.collect) {
          opts.collect.push(change)
        } else if (!opts?.skipHistory) {
          pushHistory([change], opts?.label ?? describeChange([change]))
        }
        // Refrescar server state sin recargar
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al guardar')
        setLocalValues((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      } finally {
        setPendingCells((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    })
  }

  async function handleEmit(opts?: { acknowledgeReissueImpact?: boolean }) {
    setPublishing(true)
    try {
      const result = await emitAndNotify({
        propertyId: grid.propertyId,
        year: currentMonth.year,
        month: currentMonth.month,
        acknowledgeReissueImpact: opts?.acknowledgeReissueImpact ?? false,
      })
      setPublishResult(result)
      setReissueDialogOpen(false)
      toast.success(`Liquidación emitida · ${result.neighbors.length} vecinos`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al emitir')
    } finally {
      setPublishing(false)
    }
  }

  async function handleQuickPay({ unitId, amount }: { unitId: string; amount: number }) {
    const result = await quickPayFromMesa({
      propertyId: grid.propertyId,
      year: currentMonth.year,
      month: currentMonth.month,
      unitId,
      amount,
    })
    toast.success(`Pago registrado · Recibo ${result.receiptNumber}`)
  }

  const allRows = grid.freeRow ? [...grid.rows, grid.freeRow] : grid.rows

  // La grilla es de solo lectura: no hay edición de celdas, atajos de
  // deshacer/rehacer/copiar ni selección múltiple. Los gastos se cargan y
  // editan exclusivamente desde la sección Gastos.

  const filteredRows = allRows

  // Agrupación: si groupBy = 'category', armamos grupos. Extraordinarias siempre
  // forman su propio grupo al final. Si hay búsqueda activa, no agrupamos.
  type RowGroup = { key: string; label: string; rows: IAdminMonthlyGridRow[]; isExtra: boolean }
  const groups: RowGroup[] = useMemo(() => {
    if (groupBy === 'none' || search.trim()) {
      return [{ key: '__all__', label: '', rows: filteredRows, isExtra: false }]
    }
    const byKey = new Map<string, RowGroup>()
    for (const row of filteredRows) {
      if (row.expenseKind === 'extraordinaria') {
        const g = byKey.get('__ext__') ?? { key: '__ext__', label: 'Extraordinarias', rows: [], isExtra: true }
        g.rows.push(row)
        byKey.set('__ext__', g)
        continue
      }
      const cat = (row.category ?? '').trim() || 'Sin categoría'
      const k = `cat:${cat.toLowerCase()}`
      const g = byKey.get(k) ?? { key: k, label: cat, rows: [], isExtra: false }
      g.rows.push(row)
      byKey.set(k, g)
    }
    // Ordenar: primero las categorías alfabéticamente, extraordinarias al final
    const list = Array.from(byKey.values()).filter((g) => !g.isExtra).sort((a, b) => a.label.localeCompare(b.label))
    const extra = Array.from(byKey.values()).find((g) => g.isExtra)
    return extra ? [...list, extra] : list
  }, [filteredRows, groupBy, search])

  // Lista plana de filas visibles (respeta grupos colapsados). Es la que usa kbd-nav.
  const visibleRows: IAdminMonthlyGridRow[] = useMemo(() => {
    if (groupBy === 'none' || search.trim()) return filteredRows
    const out: IAdminMonthlyGridRow[] = []
    for (const g of groups) {
      if (collapsedGroups.has(g.key)) continue
      for (const r of g.rows) out.push(r)
    }
    return out
  }, [groups, groupBy, search, collapsedGroups, filteredRows])

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    clearSelection()
  }

  // Reset de selección cuando cambia el layout (filtro / agrupación / rango)
  useEffect(() => {
    clearSelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, groupBy, visibleRange])

  function subtotalForGroup(g: RowGroup, year: number, month: number): number {
    let total = 0
    for (const row of g.rows) {
      const val = getDisplayAmount(row, year, month)
      if (val !== null) total += val
    }
    return total
  }

  // --------------------------------------------------------------------------
  // Undo / Redo
  // --------------------------------------------------------------------------
  function findRowByProviderId(providerId: string): IAdminMonthlyGridRow | null {
    if (!providerId && grid.freeRow) return grid.freeRow
    return grid.rows.find((r) => r.providerId === providerId) ?? null
  }

  async function applyChanges(
    changes: CellChange[],
    direction: 'forward' | 'back',
  ): Promise<number> {
    let applied = 0
    for (const c of changes) {
      const row = findRowByProviderId(c.providerId)
      if (!row) continue
      const amount = direction === 'forward' ? c.next : c.previous
      try {
        await upsertMonthlyCell({
          propertyId: grid.propertyId,
          providerId: c.providerId || null,
          year: c.year,
          month: c.month,
          amount,
          expenseKind: c.expenseKind,
        })
        const k = cellKey(c.providerId, c.year, c.month)
        setLocalValues((prev) => ({ ...prev, [k]: amount }))
        applied += 1
      } catch {
        // no-op: seguimos con las demás
      }
    }
    if (applied > 0) {
      setLastSavedAt(new Date())
      router.refresh()
    }
    return applied
  }

  async function undo() {
    const entry = history[history.length - 1]
    if (!entry) {
      toast.info('No hay nada que deshacer')
      return
    }
    const applied = await applyChanges(entry.changes, 'back')
    if (applied === 0) {
      toast.error('No se pudo deshacer (¿período cerrado?)')
      return
    }
    setHistory((prev) => prev.slice(0, -1))
    setRedoStack((prev) => [...prev, entry].slice(-HISTORY_CAP))
    toast.success(`Deshecho: ${entry.label}`)
  }

  async function redo() {
    const entry = redoStack[redoStack.length - 1]
    if (!entry) {
      toast.info('No hay nada que rehacer')
      return
    }
    const applied = await applyChanges(entry.changes, 'forward')
    if (applied === 0) {
      toast.error('No se pudo rehacer')
      return
    }
    setRedoStack((prev) => prev.slice(0, -1))
    setHistory((prev) => [...prev, entry].slice(-HISTORY_CAP))
    toast.success(`Rehecho: ${entry.label}`)
  }

  // --------------------------------------------------------------------------
  // Acciones batch (selección múltiple)
  // --------------------------------------------------------------------------
  function handleSelectRange(target: { r: number; m: number }) {
    const anchor = selectionAnchor ?? target
    setSelectionAnchor(anchor)
    setSelection(rectSelection(anchor, target))
  }

  function handleToggleSelect(cell: { r: number; m: number }) {
    const k = `${cell.r}-${cell.m}`
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
    setSelectionAnchor(cell)
  }

  async function clearSelectedCells() {
    const keys = Array.from(selection)
    if (keys.length === 0) return
    const collected: CellChange[] = []
    for (const k of keys) {
      const [rStr, mStr] = k.split('-')
      const r = Number(rStr)
      const m = Number(mStr)
      const row = visibleRows[r]
      const month = visibleMonths[m]
      if (!row || !month) continue
      const cell = row.cells.find((c) => c.year === month.year && c.month === month.month)
      if (!cell?.isEditable) continue
      const current = getDisplayAmount(row, month.year, month.month)
      if (current === null) continue
      await commitCell(row, month.year, month.month, null, { collect: collected })
    }
    if (collected.length > 0) {
      pushHistory(collected, `Limpiar ${collected.length} ${collected.length === 1 ? 'celda' : 'celdas'}`)
      toast.success(`${collected.length} ${collected.length === 1 ? 'celda limpiada' : 'celdas limpiadas'}`)
    }
    clearSelection()
  }

  function describeDelta(mod: DeltaModifier, count: number): string {
    switch (mod.kind) {
      case 'percent':
        return `${mod.pct >= 0 ? '+' : ''}${mod.pct}% a ${count} ${count === 1 ? 'celda' : 'celdas'}`
      case 'multiply':
        return `×${mod.factor} a ${count} ${count === 1 ? 'celda' : 'celdas'}`
      case 'add':
        return `${mod.delta >= 0 ? '+' : ''}${mod.delta} a ${count} ${count === 1 ? 'celda' : 'celdas'}`
      case 'absolute':
        return `= ${mod.value} en ${count} ${count === 1 ? 'celda' : 'celdas'}`
    }
  }

  /**
   * Arma un TSV con los valores de la selección, respetando la bounding box
   * (celdas no seleccionadas dentro de la box quedan vacías) y el orden
   * visual (filas de arriba a abajo, meses de izquierda a derecha).
   * Números en formato AR: punto de miles + coma decimal.
   */
  function buildSelectionTSV(): string {
    const keys = Array.from(selection)
    if (keys.length === 0) return ''
    const coords = keys.map((k) => {
      const [rStr, mStr] = k.split('-')
      return { r: Number(rStr), m: Number(mStr) }
    })
    const r0 = Math.min(...coords.map((c) => c.r))
    const r1 = Math.max(...coords.map((c) => c.r))
    const m0 = Math.min(...coords.map((c) => c.m))
    const m1 = Math.max(...coords.map((c) => c.m))
    const lines: string[] = []
    const formatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
    for (let r = r0; r <= r1; r++) {
      const cells: string[] = []
      for (let m = m0; m <= m1; m++) {
        const inSel = selection.has(`${r}-${m}`)
        if (!inSel) {
          cells.push('')
          continue
        }
        const row = visibleRows[r]
        const month = visibleMonths[m]
        if (!row || !month) {
          cells.push('')
          continue
        }
        const amount = getDisplayAmount(row, month.year, month.month)
        cells.push(amount === null ? '' : formatter.format(amount))
      }
      lines.push(cells.join('\t'))
    }
    return lines.join('\n')
  }

  async function copySelection() {
    if (selection.size === 0) return
    const tsv = buildSelectionTSV()
    if (!tsv) return
    try {
      await navigator.clipboard.writeText(tsv)
      toast.success(
        `${selection.size} ${selection.size === 1 ? 'celda' : 'celdas'} copiadas al portapapeles`,
      )
    } catch {
      toast.error('No se pudo copiar al portapapeles')
    }
  }

  async function applyDeltaToSelection(mod: DeltaModifier) {
    const keys = Array.from(selection)
    if (keys.length === 0) return
    const collected: CellChange[] = []
    let skipped = 0
    for (const k of keys) {
      const [rStr, mStr] = k.split('-')
      const r = Number(rStr)
      const m = Number(mStr)
      const row = visibleRows[r]
      const month = visibleMonths[m]
      if (!row || !month) continue
      const cellMeta = row.cells.find((c) => c.year === month.year && c.month === month.month)
      if (!cellMeta?.isEditable) {
        skipped += 1
        continue
      }
      const current = getDisplayAmount(row, month.year, month.month)
      const next = applyDeltaToAmount(current, mod)
      if (next === null) {
        skipped += 1
        continue
      }
      if (current !== null && Math.abs(next - current) < 0.005) continue // no-op
      const normalized = next === 0 ? null : Math.round(next * 100) / 100
      await commitCell(row, month.year, month.month, normalized, { collect: collected })
    }
    if (collected.length > 0) {
      pushHistory(collected, describeDelta(mod, collected.length))
      toast.success(
        `${collected.length} ${collected.length === 1 ? 'celda actualizada' : 'celdas actualizadas'}${
          skipped > 0 ? ` · ${skipped} saltadas` : ''
        }`,
      )
    } else if (skipped > 0) {
      toast.info('No se aplicó nada: las celdas están vacías o cerradas')
    }
  }

  /**
   * Distribuye un valor o matriz de valores a las celdas seleccionadas.
   * Acepta "text/plain" con \t (columnas) y \n (filas), estilo Excel.
   * Si no hay selección múltiple, devuelve false y el caller decide qué hacer.
   */
  async function pasteDistributed(anchor: { r: number; m: number }, text: string): Promise<boolean> {
    const rows = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((r) => r.length > 0)
    if (rows.length === 0) return false

    const grid = rows.map((r) => r.split('\t'))
    const maxCols = Math.max(...grid.map((r) => r.length))

    // Single-cell paste → que el caller lo maneje
    if (grid.length === 1 && maxCols === 1) return false

    const collected: CellChange[] = []
    for (let dr = 0; dr < grid.length; dr++) {
      const rowIdx = anchor.r + dr
      const targetRow = visibleRows[rowIdx]
      if (!targetRow) continue
      for (let dm = 0; dm < maxCols; dm++) {
        const monthIdx = anchor.m + dm
        const targetMonth = visibleMonths[monthIdx]
        if (!targetMonth) continue
        const raw = grid[dr][dm]
        if (raw === undefined) continue
        const cell = targetRow.cells.find((c) => c.year === targetMonth.year && c.month === targetMonth.month)
        if (!cell?.isEditable) continue
        const n = parseNumericString(raw)
        if (n === null) continue
        await commitCell(targetRow, targetMonth.year, targetMonth.month, n === 0 ? null : n, {
          collect: collected,
        })
      }
    }
    if (collected.length > 0) {
      pushHistory(
        collected,
        `Pegar en ${collected.length} ${collected.length === 1 ? 'celda' : 'celdas'}`,
      )
      toast.success(
        `${collected.length} ${collected.length === 1 ? 'celda pegada' : 'celdas pegadas'} desde el portapapeles`,
      )
    }
    return true
  }

  // Movimiento entre celdas. `edit: true` abre edit mode directamente.
  function moveFocus(targetRow: number, targetMonth: number, edit = false) {
    if (visibleRows.length === 0) return
    const totalRows = visibleRows.length
    const totalMonths = visibleMonths.length
    const r = Math.max(0, Math.min(totalRows - 1, targetRow))
    const m = Math.max(0, Math.min(totalMonths - 1, targetMonth))
    const row = visibleRows[r]
    const month = visibleMonths[m]
    const cell = row.cells.find((c) => c.year === month.year && c.month === month.month)
    const isEditable = cell?.isEditable ?? false

    if (edit && isEditable) {
      setEditingCell(cellKey(row.providerId, month.year, month.month))
    } else {
      setEditingCell(null)
      queueMicrotask(() => {
        cellRefs.current.get(`${r}-${m}`)?.focus()
      })
    }
  }

  return (
    <div className="space-y-4">
      <MesaHeader
        grid={grid}
        state={state}
        visibleRange={visibleRange}
        onChangeRange={setVisibleRange}
      />

      {previousState && grid.months.length >= 2 ? (
        <MesaPreviousRecap
          previousMonth={grid.months[grid.months.length - 2]}
          previousState={previousState}
        />
      ) : null}

      {grid.activeUnitsCount === 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠ No hay unidades activas. Agregá las unidades desde Configuración → Datos del consorcio.
        </div>
      ) : null}

      <section className="mesa-card overflow-hidden">
        <header className="px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-4 flex-wrap min-w-0 flex-1">
            <div className="min-w-0">
              <h2 className="font-serif text-lg font-semibold text-foreground">Gastos del mes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Resumen de solo lectura. Para cargar o editar gastos usá la sección Gastos. La mini-curva a la derecha es la tendencia del rubro.
              </p>
            </div>
          </div>
          {(() => {
            // Botón para repetir los gastos del mes anterior en el período pivote.
            // Sólo si el período sigue editable (no cerrado/bloqueado ni liquidado).
            const pivot = grid.months[grid.months.length - 1]
            if (!canManageRubros || !pivot) return null
            const editable =
              pivot.periodStatus !== 'closed' &&
              pivot.periodStatus !== 'locked' &&
              pivot.runStatus !== 'issued' &&
              pivot.runStatus !== 'closed'
            if (!editable) return null
            const pivotHasExpenses = (grid.totalByMonth[`${pivot.year}-${pivot.month}`] ?? 0) > 0
            return (
              <RepeatPreviousMonthButton
                managedPropertyId={grid.propertyId}
                targetYear={pivot.year}
                targetMonth={pivot.month}
                targetHasExpenses={pivotHasExpenses}
              />
            )
          })()}
        </header>

        <div className="divider-soft" />

        {allRows.length > 3 ? (
          <div className="px-6 py-2.5 flex items-center gap-2 flex-wrap bg-muted/10">
            <div className="seg" role="group" aria-label="Agrupar rubros">
              <button
                type="button"
                aria-pressed={groupBy === 'none'}
                onClick={() => setGroupBy('none')}
              >
                Sin agrupar
              </button>
              <button
                type="button"
                aria-pressed={groupBy === 'category'}
                onClick={() => setGroupBy('category')}
              >
                Por categoría
              </button>
            </div>
          </div>
        ) : null}

        <ScrollableTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] border-b border-border/40 bg-muted/25">
                <th className="text-left px-4 py-3 font-medium sticky left-0 bg-muted/25 z-10 min-w-[240px] sticky-shadow-right relative">
                  Rubro
                </th>
                {visibleMonths.map((m) => (
                  <th
                    key={`${m.year}-${m.month}`}
                    className={`text-right px-4 py-3 font-medium min-w-[108px] ${m.isCurrent ? 'th-current-month' : ''}`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {m.isCurrent ? <span className="live-dot inline-block text-primary" aria-hidden /> : null}
                      {m.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleMonths.length + 1} className="px-0 py-0">
                    <EmptyState
                      icon={FileSpreadsheet}
                      title="La planilla está vacía"
                      description="Todavía no se cargaron rubros. Configurá proveedores recurrentes desde Proveedores."
                    />
                  </td>
                </tr>
              ) : (
                (() => {
                  // Render agrupado o flat — usamos un contador global para rowIdx
                  // de navegación por teclado (sobre `visibleRows`, que excluye grupos colapsados)
                  let visibleIdx = 0
                  const fragments: React.ReactNode[] = []
                  const isGrouped = groupBy === 'category' && !search.trim()

                  for (const g of groups) {
                    if (isGrouped && g.label) {
                      const collapsed = collapsedGroups.has(g.key)
                      fragments.push(
                        <tr
                          key={`grp-${g.key}`}
                          className="bg-muted/20 border-b border-border/20 text-xs"
                        >
                          <td className="px-4 py-1.5 sticky left-0 bg-muted/25 sticky-shadow-right relative">
                            <button
                              type="button"
                              onClick={() => toggleGroup(g.key)}
                              className="flex items-center gap-1.5 text-foreground font-medium uppercase tracking-[0.08em] text-[10px] hover:text-primary transition-colors"
                              aria-expanded={!collapsed}
                            >
                              <ChevronRight
                                className={`w-3 h-3 transition-transform ${collapsed ? '' : 'rotate-90'}`}
                              />
                              {g.label}
                              <span className="text-muted-foreground font-normal normal-case tracking-normal">
                                · {g.rows.length}
                              </span>
                            </button>
                          </td>
                          {visibleMonths.map((m) => {
                            const subtotal = subtotalForGroup(g, m.year, m.month)
                            return (
                              <td
                                key={`grp-${g.key}-${m.year}-${m.month}`}
                                className={`px-4 py-1.5 text-right tabular-nums text-[11px] text-muted-foreground stat-value ${m.isCurrent ? 'th-current-month' : ''}`}
                              >
                                {subtotal > 0 ? `$ ${formatARSShort(subtotal)}` : '—'}
                              </td>
                            )
                          })}
                        </tr>,
                      )
                      if (collapsed) continue
                    }
                    for (const row of g.rows) {
                      const rowIdx = visibleIdx
                      visibleIdx += 1
                      const fullSeries = grid.months.map((m) => getDisplayAmount(row, m.year, m.month))
                      fragments.push(
                        <tr
                          key={row.providerId || 'free'}
                          data-provider-id={row.providerId || undefined}
                          className="planilla-row border-b border-border/15 last:border-0 transition-colors"
                        >
                          <td className="px-4 py-2 sticky left-0 bg-background sticky-shadow-right relative">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-foreground truncate flex items-center gap-1.5">
                                  {row.providerName}
                                  {row.expenseKind === 'extraordinaria' ? (
                                    <span className="inline-flex rounded-full bg-purple-100 text-purple-800 px-1.5 py-0 text-[9px] font-medium">
                                      EXT
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <Sparkline
                                values={fullSeries}
                                width={72}
                                height={20}
                                ariaLabel={`Tendencia de ${row.providerName}`}
                              />
                            </div>
                          </td>
                          {visibleMonths.map((m, monthIdx) => {
                            const displayedAmount = getDisplayAmount(row, m.year, m.month)
                            const cellData = row.cells.find((c) => c.year === m.year && c.month === m.month)
                            // Anomaly sólo si NO estamos editando esa celda (para no distraer)
                            const isEditingThis = editingCell === cellKey(row.providerId, m.year, m.month)
                            const anomaly = isEditingThis ? null : detectCellAnomaly(row, m.year, m.month, displayedAmount)
                            const selKey = `${rowIdx}-${monthIdx}`
                            const isSelected = selection.has(selKey)
                            const isAnchor =
                              selectionAnchor?.r === rowIdx && selectionAnchor?.m === monthIdx
                            return (
                              <EditableCell
                                key={`${row.providerId}-${m.year}-${m.month}`}
                                rowIdx={rowIdx}
                                monthIdx={monthIdx}
                                registerRef={registerCellRef}
                                providerName={row.providerName}
                                cellData={cellData}
                                editing={isEditingThis}
                                pending={pendingCells.has(cellKey(row.providerId, m.year, m.month))}
                                saved={savedCells.has(cellKey(row.providerId, m.year, m.month))}
                                anomaly={anomaly}
                                amount={displayedAmount}
                                isCurrent={m.isCurrent}
                                isEditable={false}
                                isSelected={isSelected}
                                isAnchor={isAnchor}
                                selectionSize={selection.size}
                                editSeed={isEditingThis ? editSeed : null}
                                onStartEdit={(seed?: string) => {
                                  setEditSeed(seed ?? null)
                                  setEditingCell(cellKey(row.providerId, m.year, m.month))
                                  setSelection(new Set([selKey]))
                                  setSelectionAnchor({ r: rowIdx, m: monthIdx })
                                }}
                                onCommit={(val) => {
                                  setEditingCell(null)
                                  setEditSeed(null)
                                  void commitCell(row, m.year, m.month, val)
                                }}
                                onCancel={() => {
                                  setEditingCell(null)
                                  setEditSeed(null)
                                }}
                                onClear={() => {
                                  if (selection.size > 1) {
                                    void clearSelectedCells()
                                    return
                                  }
                                  if (displayedAmount === null) return
                                  void commitCell(row, m.year, m.month, null)
                                }}
                                onPasteAmount={(val) => {
                                  if (selection.size > 1) {
                                    // Multi-cell paste: aplicar el mismo valor a todas las selected
                                    void (async () => {
                                      const collected: CellChange[] = []
                                      for (const k of selection) {
                                        const [rStr, mStr] = k.split('-')
                                        const rr = Number(rStr)
                                        const mm = Number(mStr)
                                        const targetRow = visibleRows[rr]
                                        const targetMonth = visibleMonths[mm]
                                        if (!targetRow || !targetMonth) continue
                                        const tCell = targetRow.cells.find(
                                          (c) => c.year === targetMonth.year && c.month === targetMonth.month,
                                        )
                                        if (!tCell?.isEditable) continue
                                        await commitCell(
                                          targetRow,
                                          targetMonth.year,
                                          targetMonth.month,
                                          val,
                                          { collect: collected },
                                        )
                                      }
                                      if (collected.length > 0) {
                                        pushHistory(
                                          collected,
                                          `Pegar ${val} en ${collected.length} ${collected.length === 1 ? 'celda' : 'celdas'}`,
                                        )
                                        toast.success(
                                          `${collected.length} ${collected.length === 1 ? 'celda' : 'celdas'} con el mismo valor`,
                                        )
                                      }
                                    })()
                                    return
                                  }
                                  void commitCell(row, m.year, m.month, val)
                                }}
                                onPasteRaw={async (text) => {
                                  const handled = await pasteDistributed({ r: rowIdx, m: monthIdx }, text)
                                  return handled
                                }}
                                onSelectRange={() => handleSelectRange({ r: rowIdx, m: monthIdx })}
                                onToggleSelect={() => handleToggleSelect({ r: rowIdx, m: monthIdx })}
                                onMove={(r, c, edit, opts) => {
                                  if (opts?.extendSelection) {
                                    const anchor = selectionAnchor ?? { r: rowIdx, m: monthIdx }
                                    setSelectionAnchor(anchor)
                                    setSelection(rectSelection(anchor, { r, m: c }))
                                    // mover foco pero sin editar
                                    setEditingCell(null)
                                    queueMicrotask(() => {
                                      const totalRows = visibleRows.length
                                      const totalMonths = visibleMonths.length
                                      const rr = Math.max(0, Math.min(totalRows - 1, r))
                                      const mm = Math.max(0, Math.min(totalMonths - 1, c))
                                      cellRefs.current.get(`${rr}-${mm}`)?.focus()
                                    })
                                    return
                                  }
                                  // Arrow normal → limpia selección y mueve
                                  setSelection(new Set())
                                  setSelectionAnchor(null)
                                  moveFocus(r, c, edit)
                                }}
                              />
                            )
                          })}
                        </tr>,
                      )
                    }
                  }
                  return fragments
                })()
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gradient-to-b from-muted/40 to-muted/60 font-serif font-bold text-[15px]">
                <td className="px-4 py-3 sticky left-0 bg-muted/50 sticky-shadow-right relative tracking-wide text-foreground">
                  {search.trim() ? 'SUBTOTAL' : 'TOTAL'}
                </td>
                {visibleMonths.map((m) => {
                  let total = 0
                  for (const row of filteredRows) {
                    const val = getDisplayAmount(row, m.year, m.month)
                    if (val !== null) total += val
                  }
                  return (
                    <td
                      key={`tot-${m.year}-${m.month}`}
                      className={`px-4 py-3 text-right tabular-nums stat-value ${m.isCurrent ? 'th-current-month' : ''}`}
                    >
                      {total > 0 ? `$ ${formatARSShort(total)}` : '—'}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </ScrollableTable>
      </section>

      <MesaDistribution state={state} />

      <MesaPayments
        state={state}
        cashAccounts={cashAccounts}
        canRegister={canRegisterPayments}
        onPayQuick={handleQuickPay}
        propertyId={grid.propertyId}
        currentMonthYear={currentMonth.year}
        currentMonth={currentMonth.month}
      />

      {(() => {
        // Estado del CTA de emisión / re-emisión. Cuatro variantes:
        //  1) sin run (o draft/calculated)        → "Emitir y avisar"
        //  2) run issued + sin cambios            → "Liquidación al día" (deshabilitado)
        //  3) run issued + con cambios            → "Re-emitir con los cambios"
        //     (si hay pagos vivos, pide confirmación)
        //  4) run closed                          → "Período cerrado" (link a reabrir)
        const currentTotal =
          Math.round((state.totalToDistribute + state.previousBalanceTotal) * 100) / 100
        const runTotal = state.runSnapshotTotal
        const isClosed = state.runStatus === 'closed'
        const isIssued = state.runStatus === 'issued'
        const isReissue = state.hasRun && (isIssued || isClosed)
        const hasChanges =
          state.hasRun &&
          (runTotal === null || Math.abs(currentTotal - runTotal) > 0.01)
        const upToDate = isReissue && !hasChanges
        const needsReissueConfirm =
          isReissue && (isClosed || state.runLivePaymentsCount > 0)

        const baseDisabled =
          !canEmit ||
          !grid.readyToEmit ||
          publishing ||
          grid.activeUnitsCount === 0

        // --- Variante 4: período cerrado, no permitimos re-emitir desde acá ---
        if (isClosed) {
          return (
            <section className="mesa-card p-5 border-l-4 border-l-slate-400">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                  <Lock className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-serif text-lg font-semibold text-foreground">
                      Período cerrado
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      La liquidación de {currentMonth.label} está cerrada y no se puede re-emitir desde acá.
                      {state.runLivePaymentsCount > 0
                        ? ` Tiene ${state.runLivePaymentsCount} pago${state.runLivePaymentsCount === 1 ? '' : 's'} vivo${state.runLivePaymentsCount === 1 ? '' : 's'} asociado${state.runLivePaymentsCount === 1 ? '' : 's'}.`
                        : ''}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )
        }

        // --- Variante 2: ya emitida y sin cambios ---
        if (upToDate) {
          return (
            <section className="mesa-card p-5 border-l-4 border-l-emerald-500/60">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                  <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-serif text-lg font-semibold text-foreground">
                      Liquidación al día
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      La liquidación emitida de {currentMonth.label} ya refleja los totales actuales.
                      Hacé un cambio en la planilla para habilitar la re-emisión.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )
        }

        // --- Variantes 1 y 3: emitir / re-emitir ---
        const isReissueAction = isReissue
        const title = isReissueAction
          ? 'Re-emitir con los cambios'
          : 'Emitir y avisar a los vecinos'

        const subtitle = !canEmit
          ? 'Tu rol no puede emitir liquidaciones.'
          : !grid.readyToEmit
            ? 'Cargá al menos un gasto del mes para poder emitir.'
            : isReissueAction
              ? `Se reemplaza la liquidación de ${currentMonth.label} y se reenvían los mensajes a los ${grid.activeUnitsCount} vecinos.`
              : `Se genera la liquidación de ${currentMonth.label} y los mensajes para los ${grid.activeUnitsCount} vecinos.`

        function triggerEmit() {
          if (needsReissueConfirm) {
            setReissueDialogOpen(true)
            return
          }
          void handleEmit()
        }

        return (
          <section
            className={[
              'mesa-card p-5',
              isReissueAction ? 'border-l-4 border-l-amber-500/70' : '',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                {isReissueAction ? (
                  <RefreshCw className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                ) : null}
                <div>
                  <h3 className="font-serif text-lg font-semibold text-foreground">{title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                  {isReissueAction && state.runLivePaymentsCount > 0 ? (
                    <p className="text-[11px] text-amber-700 mt-1 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Hay {state.runLivePaymentsCount} pago
                      {state.runLivePaymentsCount === 1 ? '' : 's'} vivo
                      {state.runLivePaymentsCount === 1 ? '' : 's'} (total $
                      {state.runLivePaymentsTotal.toFixed(2)}) que quedan desvinculados.
                    </p>
                  ) : null}
                </div>
              </div>
              <Button
                data-emit-button
                size="lg"
                disabled={baseDisabled}
                onClick={triggerEmit}
                variant={isReissueAction ? 'default' : 'default'}
              >
                {publishing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Procesando…
                  </>
                ) : (
                  <>
                    {isReissueAction ? (
                      <RefreshCw className="w-4 h-4 mr-1.5" />
                    ) : (
                      <Send className="w-4 h-4 mr-1.5" />
                    )}
                    {isReissueAction ? 'Re-emitir' : 'Emitir y avisar'}
                  </>
                )}
              </Button>
            </div>
          </section>
        )
      })()}

      {state.runId && (state.runStatus === 'issued' || state.runStatus === 'closed') ? (
        <section className="mesa-card p-5 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Estado de la liquidación
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {state.runStatus === 'closed'
                ? `La liquidación de ${currentMonth.label} está cerrada. Podés reabrirla si necesitás corregirla.`
                : `La liquidación de ${currentMonth.label} está emitida. Cerrala para asentar el período definitivamente.`}
            </p>
          </div>
          <LiquidationStateButton
            runId={state.runId}
            propertyId={grid.propertyId}
            currentStatus={state.runStatus}
            periodLabel={currentMonth.label}
            userCapabilities={liquidationCaps}
          />
        </section>
      ) : null}

      <AlertDialog open={reissueDialogOpen} onOpenChange={setReissueDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              ¿Re-emitir la liquidación?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Al re-emitir la liquidación de <strong>{currentMonth.label}</strong> se
                  reemplazan todos los items, se anulan los asientos contables anteriores y
                  se vuelven a generar los links para los vecinos.
                </p>
                {state.runStatus === 'closed' ? (
                  <p className="text-amber-700">
                    <strong>Este período está cerrado.</strong> La re-emisión lo reabre automáticamente.
                  </p>
                ) : null}
                {state.runLivePaymentsCount > 0 ? (
                  <p className="text-amber-700">
                    Hay <strong>{state.runLivePaymentsCount}</strong> pago
                    {state.runLivePaymentsCount === 1 ? '' : 's'} vivo
                    {state.runLivePaymentsCount === 1 ? '' : 's'} (total{' '}
                    <strong>${state.runLivePaymentsTotal.toFixed(2)}</strong>) que quedan
                    desvinculados de los items nuevos. Los recibos siguen siendo válidos
                    pero hay que re-imputarlos manualmente.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={publishing}
              onClick={(e) => {
                e.preventDefault()
                void handleEmit({ acknowledgeReissueImpact: true })
              }}
            >
              {publishing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Re-emitiendo…
                </>
              ) : (
                'Re-emitir igual'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {publishResult ? (
        <PublishDialog result={publishResult} onClose={() => setPublishResult(null)} />
      ) : null}
    </div>
  )
}

/**
 * Wrapper que detecta el scroll horizontal de la tabla y agrega la clase
 * `is-scrolled` al contenedor, para que la columna sticky muestre su sombra
 * lateral. 100% CSS, sin JS en cada frame gracias al throttle de rAF.
 */
function ScrollableTable({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!ref.current) return
        ref.current.classList.toggle('is-scrolled', ref.current.scrollLeft > 4)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // Estado inicial
    onScroll()
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={ref} className="overflow-x-auto">
      {children}
    </div>
  )
}

type EditableCellProps = {
  rowIdx: number
  monthIdx: number
  registerRef: (rowIdx: number, monthIdx: number, el: HTMLTableCellElement | null) => void
  providerName: string
  cellData: IAdminMonthlyGridRow['cells'][number] | undefined
  editing: boolean
  pending: boolean
  saved: boolean
  anomaly: CellAnomaly | null
  amount: number | null
  isCurrent: boolean
  isEditable: boolean
  editSeed?: string | null
  isSelected?: boolean
  isAnchor?: boolean
  selectionSize?: number
  onStartEdit: (seed?: string) => void
  onCommit: (val: number | null) => void
  onCancel: () => void
  onClear?: () => void
  onPasteAmount?: (val: number) => void
  onPasteRaw?: (text: string) => Promise<boolean>
  onSelectRange?: () => void
  onToggleSelect?: () => void
  onMove: (
    rowIdx: number,
    monthIdx: number,
    edit?: boolean,
    opts?: { extendSelection?: boolean },
  ) => void
}

function parseNumericString(s: string): number | null {
  const cleaned = s.trim().replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function EditableCell({
  rowIdx,
  monthIdx,
  registerRef,
  providerName,
  cellData,
  editing,
  pending,
  saved,
  anomaly,
  amount,
  isCurrent,
  isEditable,
  editSeed,
  isSelected,
  isAnchor,
  selectionSize = 0,
  onStartEdit,
  onCommit,
  onCancel,
  onClear,
  onPasteAmount,
  onPasteRaw,
  onSelectRange,
  onToggleSelect,
  onMove,
}: EditableCellProps) {
  const [draft, setDraft] = useState(
    editSeed !== null && editSeed !== undefined ? editSeed : amount !== null ? String(amount) : '',
  )

  if (editing && isEditable) {
    return (
      <td
        className={`px-1 py-1 ${isCurrent ? 'th-current-month' : ''}`}
        ref={(el) => registerRef(rowIdx, monthIdx, el)}
      >
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = draft.trim() ? Number(draft.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) : null
            if (n !== null && !Number.isFinite(n)) {
              onCancel()
              return
            }
            onCommit(n === 0 ? null : n)
          }}
          onKeyDown={(e) => {
            const commitAndMove = (dr: number, dc: number, edit = false) => {
              const n = draft.trim() ? Number(draft.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) : null
              if (n !== null && !Number.isFinite(n)) return
              e.preventDefault()
              onCommit(n === 0 ? null : n)
              queueMicrotask(() => onMove(rowIdx + dr, monthIdx + dc, edit))
            }
            if (e.key === 'Enter') commitAndMove(1, 0, true)
            else if (e.key === 'Tab') commitAndMove(0, e.shiftKey ? -1 : 1, true)
            else if (e.key === 'Escape') {
              setDraft(amount !== null ? String(amount) : '')
              onCancel()
              queueMicrotask(() => onMove(rowIdx, monthIdx, false))
            }
          }}
          className="w-full text-right tabular-nums text-sm bg-background border border-primary/70 rounded-md px-2 py-1 outline-none shadow-[0_0_0_3px_rgba(240, 78, 35,0.12)] transition-shadow"
        />
      </td>
    )
  }


  const hasHistory = Boolean(cellData?.expenseId)
  const anomalyColor =
    !anomaly
      ? ''
      : anomaly.severity === 'hard'
        ? anomaly.kind === 'spike'
          ? 'bg-rose-500'
          : 'bg-emerald-500'
        : anomaly.kind === 'spike'
          ? 'bg-amber-400'
          : 'bg-emerald-400'
  const contents = (
    <div className="flex items-center justify-end gap-1.5 stat-value group/cell relative">
      {pending ? <Loader2 className="w-3 h-3 animate-spin text-primary" /> : null}
      {anomaly && amount !== null ? (
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${anomalyColor}`}
          title={anomaly.message}
          aria-label={anomaly.message}
        />
      ) : null}
      {hasHistory && cellData ? (
        <CellHistoryPopover cell={cellData} providerName={providerName} anomaly={anomaly}>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="absolute -top-0.5 right-full mr-1 opacity-0 group-hover/cell:opacity-60 hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
            aria-label="Ver historial"
            tabIndex={-1}
          >
            <Info className="w-3 h-3" />
          </button>
        </CellHistoryPopover>
      ) : null}
      {amount !== null ? formatARSShort(amount) : <span className="text-muted-foreground/60">—</span>}
    </div>
  )

  const selectionClass = isSelected
    ? isAnchor && selectionSize > 1
      ? 'bg-primary/15 shadow-[inset_0_0_0_2px_rgba(240, 78, 35,0.55)]'
      : 'bg-primary/10 shadow-[inset_0_0_0_1px_rgba(240, 78, 35,0.35)]'
    : ''

  return (
    <td
      ref={(el) => registerRef(rowIdx, monthIdx, el)}
      tabIndex={isEditable ? 0 : -1}
      onClick={(e) => {
        if (!isEditable) return
        if (e.shiftKey) {
          e.preventDefault()
          onSelectRange?.()
          return
        }
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          onToggleSelect?.()
          return
        }
        onStartEdit()
      }}
      onKeyDown={(e) =>
        handleNavKeys(e, {
          rowIdx,
          monthIdx,
          onMove,
          onStartEdit,
          onClear: isEditable ? onClear : undefined,
        })
      }
      onPaste={(e) => {
        if (!isEditable) return
        const text = e.clipboardData.getData('text')
        if (!text) return
        // Si el texto tiene múltiples filas/columnas, dejamos que el handler
        // del padre lo distribuya. Si no, caemos al single-cell.
        const isMulti = /\n|\t/.test(text.trim())
        if (isMulti && onPasteRaw) {
          e.preventDefault()
          void onPasteRaw(text)
          return
        }
        const n = parseNumericString(text)
        if (n !== null && Number.isFinite(n)) {
          e.preventDefault()
          onPasteAmount?.(n === 0 ? 0 : n)
        }
      }}
      className={`px-4 py-2 text-right tabular-nums transition-colors outline-none focus:shadow-[inset_0_0_0_2px_rgba(240, 78, 35,0.5)] ${
        isCurrent ? 'th-current-month font-medium' : ''
      } ${
        isEditable ? 'cursor-pointer hover:bg-primary/10' : 'cursor-default'
      } ${amount !== null ? 'text-foreground' : 'text-muted-foreground/70'} ${saved ? 'cell-saved' : ''} ${selectionClass}`}
      title={
        isEditable
          ? 'Enter edita · Del limpia · Shift+click selecciona rango · Ctrl/Cmd+click toggle'
          : undefined
      }
    >
      {contents}
    </td>
  )
}

function handleNavKeys(
  e: React.KeyboardEvent<HTMLTableCellElement>,
  args: {
    rowIdx: number
    monthIdx: number
    onMove: (r: number, c: number, edit?: boolean, opts?: { extendSelection?: boolean }) => void
    onStartEdit: (seed?: string) => void
    onClear?: () => void
  },
) {
  const { rowIdx, monthIdx, onMove, onStartEdit, onClear } = args
  // Ignoramos combos con ⌘ / Ctrl para dejar pasar paste (maneja onPaste)
  if (e.metaKey || e.ctrlKey) return

  const extend = e.shiftKey

  if (e.key === 'ArrowRight') {
    e.preventDefault()
    onMove(rowIdx, monthIdx + 1, false, { extendSelection: extend })
    return
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    onMove(rowIdx, monthIdx - 1, false, { extendSelection: extend })
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    onMove(rowIdx + 1, monthIdx, false, { extendSelection: extend })
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    onMove(rowIdx - 1, monthIdx, false, { extendSelection: extend })
    return
  }
  if (e.key === 'Enter' || e.key === 'F2') {
    e.preventDefault()
    onStartEdit()
    return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (onClear) {
      e.preventDefault()
      onClear()
    }
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    onMove(rowIdx, monthIdx + (e.shiftKey ? -1 : 1))
    return
  }
  // Tipeo directo de un dígito / decimal → entra a edit mode con ese char
  if (e.key.length === 1 && /^[0-9.,\-]$/.test(e.key)) {
    e.preventDefault()
    onStartEdit(e.key)
    return
  }
}
