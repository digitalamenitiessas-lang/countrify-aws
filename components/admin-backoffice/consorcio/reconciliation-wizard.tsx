'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { ArrowRight, CheckCircle2, Loader2, Sparkles, UploadCloud, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Money } from '@/components/admin-backoffice/shared/money'
import type { IAdminCashAccountWithBalance } from '@/lib/types'
import {
  analyzeBankStatement,
  applyReconciliation,
  type StatementAnalysisResult,
  type StatementMovement,
} from '@/app/iadmin/consorcios/[id]/conciliacion/actions'

type Props = {
  administrationId: string
  propertyId: string
  cashAccounts: IAdminCashAccountWithBalance[]
}

type Decision = {
  selected: boolean
  candidateIndex: number // 0-based en candidates[]
}

export function ReconciliationWizard({ administrationId, propertyId, cashAccounts }: Props) {
  const activeAccounts = cashAccounts.filter((a) => a.isActive)
  const [cashAccountId, setCashAccountId] = useState(activeAccounts[0]?.id ?? '')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<Array<Record<string, unknown>>>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [dateColumn, setDateColumn] = useState('')
  const [descColumn, setDescColumn] = useState('')
  const [amountColumn, setAmountColumn] = useState('')
  const [refColumn, setRefColumn] = useState('')
  const [analysis, setAnalysis] = useState<StatementAnalysisResult | null>(null)
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})
  const [analyzing, startAnalyze] = useTransition()
  const [applying, startApply] = useTransition()
  const [applied, setApplied] = useState<{ collections: number; expenses: number; errors: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFileName(null)
    setRawRows([])
    setHeaders([])
    setDateColumn('')
    setDescColumn('')
    setAmountColumn('')
    setRefColumn('')
    setAnalysis(null)
    setDecisions({})
    setApplied(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
      if (json.length === 0) {
        toast.error('Archivo vacío')
        return
      }
      const h = Object.keys(json[0] ?? {})
      setFileName(file.name)
      setHeaders(h)
      setRawRows(json)

      // Autodetección simple
      const lowerH = h.map((x) => x.toLowerCase())
      const findIdx = (keywords: string[]) =>
        lowerH.findIndex((lh) => keywords.some((k) => lh.includes(k)))
      const d = findIdx(['fecha', 'date'])
      const desc = findIdx(['descripcion', 'descripción', 'concepto', 'detalle', 'description'])
      const amt = findIdx(['importe', 'monto', 'amount', 'valor'])
      const ref = findIdx(['referencia', 'ref', 'operacion', 'operación', 'nro'])
      if (d >= 0) setDateColumn(h[d])
      if (desc >= 0) setDescColumn(h[desc])
      if (amt >= 0) setAmountColumn(h[amt])
      if (ref >= 0) setRefColumn(h[ref])

      toast.success(`${json.length} movimientos detectados`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo leer el archivo')
    }
  }

  function parseDate(raw: unknown): string | null {
    if (!raw) return null
    const s = String(raw).trim()
    // ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    // DD/MM/YYYY o DD-MM-YYYY
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
    if (m) {
      const d = m[1].padStart(2, '0')
      const mo = m[2].padStart(2, '0')
      let y = m[3]
      if (y.length === 2) y = `20${y}`
      return `${y}-${mo}-${d}`
    }
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    return null
  }

  function parseAmount(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null
    const s = String(raw).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '').trim()
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  const canAnalyze = useMemo(
    () => Boolean(fileName && dateColumn && descColumn && amountColumn && rawRows.length > 0),
    [fileName, dateColumn, descColumn, amountColumn, rawRows.length],
  )

  function buildMovements(): StatementMovement[] {
    const out: StatementMovement[] = []
    for (const row of rawRows) {
      const date = parseDate(row[dateColumn])
      const description = String(row[descColumn] ?? '').trim()
      const amount = parseAmount(row[amountColumn])
      if (!date || !description || amount === null || amount === 0) continue
      out.push({
        date,
        description,
        amount,
        reference: refColumn ? String(row[refColumn] ?? '').trim() : undefined,
      })
    }
    return out
  }

  function handleAnalyze() {
    const movements = buildMovements()
    if (movements.length === 0) {
      toast.error('No se pudo interpretar ningún movimiento')
      return
    }
    startAnalyze(async () => {
      try {
        const res = await analyzeBankStatement({
          administrationId,
          propertyId,
          movements,
        })
        setAnalysis(res)
        // Inicializar decisiones: pre-marcar candidatos con score ≥ 0.85
        const initial: Record<number, Decision> = {}
        for (const row of res.rows) {
          const top = row.candidates[0]
          const canMark = top && top.kind !== 'unknown' && top.score >= 0.85
          initial[row.index] = { selected: Boolean(canMark), candidateIndex: 0 }
        }
        setDecisions(initial)
        toast.success(`${movements.length} movimientos analizados`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al analizar')
      }
    })
  }

  function handleApply() {
    if (!analysis || !cashAccountId) {
      toast.error('Seleccioná la cuenta destino')
      return
    }
    const items: Array<Parameters<typeof applyReconciliation>[0]['items'][number]> = []
    for (const row of analysis.rows) {
      const d = decisions[row.index]
      if (!d?.selected) continue
      const cand = row.candidates[d.candidateIndex]
      if (!cand || cand.kind === 'unknown') continue
      if (cand.kind === 'collection') {
        items.push({
          kind: 'collection',
          liquidationItemId: cand.liquidationItemId,
          cashAccountId,
          amount: Math.abs(row.movement.amount),
          paidAt: row.movement.date,
          description: row.movement.description,
          reference: row.movement.reference,
        })
      } else {
        items.push({
          kind: 'expense_payment',
          expenseId: cand.expenseId,
          cashAccountId,
          paidAt: row.movement.date,
          reference: row.movement.reference,
        })
      }
    }

    if (items.length === 0) {
      toast.error('No hay items seleccionados')
      return
    }

    startApply(async () => {
      try {
        const r = await applyReconciliation({
          administrationId,
          propertyId,
          items,
        })
        setApplied({ collections: r.collectionsApplied, expenses: r.expensesPaid, errors: r.errors.length })
        toast.success(`Aplicados ${r.collectionsApplied} cobranzas y ${r.expensesPaid} pagos`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  if (activeAccounts.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-6 text-sm text-amber-900 bg-amber-50 border border-amber-200">
        No hay cuentas activas. Creá una cuenta bancaria en la pestaña <b>Cuentas</b> para poder conciliar el extracto.
      </div>
    )
  }

  if (applied) {
    return (
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <h3 className="font-serif text-lg font-semibold">Conciliacion aplicada</h3>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Cobranzas aplicadas" value={applied.collections} tone="ok" />
          <Stat label="Pagos a proveedor" value={applied.expenses} tone="ok" />
          <Stat label="Errores" value={applied.errors} tone={applied.errors > 0 ? 'warning' : 'ok'} />
        </dl>
        <div className="flex justify-end">
          <Button size="sm" onClick={reset}>Conciliar otro extracto</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Paso 1: archivo + columnas */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="font-medium text-foreground">1. Subí el extracto bancario</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Excel o CSV del banco con fecha, descripción, importe y opcionalmente referencia.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Cuenta destino *</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={cashAccountId}
              onChange={(e) => setCashAccountId(e.target.value)}
            >
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currentBalance.toLocaleString('es-AR')}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Archivo (.xlsx/.csv)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
              {fileName ?? 'Seleccionar…'}
            </Button>
          </div>
        </div>

        {headers.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ColumnPicker label="Fecha *" value={dateColumn} headers={headers} onChange={setDateColumn} />
            <ColumnPicker label="Descripcion *" value={descColumn} headers={headers} onChange={setDescColumn} />
            <ColumnPicker label="Monto *" value={amountColumn} headers={headers} onChange={setAmountColumn} />
            <ColumnPicker label="Referencia (opcional)" value={refColumn} headers={headers} onChange={setRefColumn} />
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button disabled={!canAnalyze || analyzing} onClick={handleAnalyze}>
            {analyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Analizando…
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Analizar y sugerir matches
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Paso 2: revisar y aplicar */}
      {analysis ? (
        <div className="glass-card rounded-2xl overflow-hidden">
          <header className="px-5 py-4 border-b border-border/40 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-medium text-foreground">2. Revisá los matches sugeridos</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {analysis.rows.length} movimientos · {Object.values(decisions).filter((d) => d.selected).length} seleccionados
              </p>
            </div>
            <Button size="sm" onClick={handleApply} disabled={applying}>
              {applying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Aplicando…
                </>
              ) : (
                <>Aplicar seleccionados</>
              )}
            </Button>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
                  <th className="px-3 py-2"></th>
                  <th className="text-left px-3 py-2 font-medium">Fecha</th>
                  <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                  <th className="text-right px-3 py-2 font-medium">Monto</th>
                  <th className="text-left px-3 py-2 font-medium">Match sugerido</th>
                </tr>
              </thead>
              <tbody>
                {analysis.rows.map((row) => {
                  const d = decisions[row.index] ?? { selected: false, candidateIndex: 0 }
                  const cand = row.candidates[d.candidateIndex]
                  const isIncome = row.movement.amount > 0
                  return (
                    <tr key={row.index} className="border-b border-border/30 last:border-0">
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          disabled={!cand || cand.kind === 'unknown'}
                          checked={d.selected}
                          onChange={(e) =>
                            setDecisions({ ...decisions, [row.index]: { ...d, selected: e.target.checked } })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 align-top tabular-nums text-muted-foreground">{row.movement.date}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="text-foreground truncate max-w-[260px]">{row.movement.description}</div>
                        {row.movement.reference ? (
                          <div className="text-[10px] text-muted-foreground">Ref: {row.movement.reference}</div>
                        ) : null}
                      </td>
                      <td
                        className={`px-3 py-2 align-top text-right tabular-nums font-medium ${
                          isIncome ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        <Money amount={row.movement.amount} />
                      </td>
                      <td className="px-3 py-2 align-top">
                        {row.candidates.length === 0 || !cand || cand.kind === 'unknown' ? (
                          <div className="text-xs text-muted-foreground italic">
                            {row.candidates[0]?.kind === 'unknown' ? row.candidates[0].reason : 'Sin match'}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {row.candidates.map((c, idx) =>
                              c.kind === 'unknown' ? null : (
                                <label key={idx} className="flex items-start gap-2 text-xs cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`cand-${row.index}`}
                                    checked={d.candidateIndex === idx}
                                    onChange={() => setDecisions({ ...decisions, [row.index]: { ...d, candidateIndex: idx } })}
                                    className="mt-0.5"
                                  />
                                  <span>
                                    <span className="font-medium text-foreground">
                                      {c.kind === 'collection' ? `${c.unitCode}${c.holderName ? ` · ${c.holderName}` : ''}` : c.providerName ?? c.description}
                                    </span>
                                    <span
                                      className={`ml-1.5 inline-flex rounded-full px-1.5 py-0 text-[9px] font-medium ${
                                        c.score >= 0.85
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : c.score >= 0.65
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-muted text-muted-foreground'
                                      }`}
                                    >
                                      {Math.round(c.score * 100)}%
                                    </span>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {c.kind === 'collection'
                                        ? `Saldo ${c.balanceRemaining.toLocaleString('es-AR')} · ${c.reason}`
                                        : `Monto ${c.amount.toLocaleString('es-AR')} · ${c.reason}`}
                                    </div>
                                  </span>
                                </label>
                              ),
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ColumnPicker({
  label,
  value,
  headers,
  onChange,
}: {
  label: string
  value: string
  headers: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <select
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warning' }) {
  const toneClass = tone === 'ok' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : 'text-foreground'
  return (
    <div className="rounded-xl bg-muted/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-serif text-xl font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}
