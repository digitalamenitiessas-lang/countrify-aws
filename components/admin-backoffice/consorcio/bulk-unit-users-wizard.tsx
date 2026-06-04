'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowLeft, CheckCircle2, ClipboardPaste, Loader2, Pencil, Plus, RotateCcw, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  confirmBulkUnitUsers,
  previewBulkUnitUsers,
  type ConfirmBulkResult,
} from '@/app/iadmin/consorcios/[id]/vecinos-masivo/actions'
import { parsePastedTable, type ConfirmRowInput, type PreviewResult } from '@/lib/iadmin/paste-table'

type Props = {
  administrationId: string
  propertyId: string
  propertyName: string
}

type Relationship = 'vecino_principal' | 'vecino_adicional'
type HolderKind = 'propietario' | 'inquilino' | 'apoderado' | 'otro'

const HOLDER_KIND_OPTIONS: Array<{ value: HolderKind; label: string }> = [
  { value: 'propietario', label: 'Propietario' },
  { value: 'inquilino', label: 'Inquilino' },
  { value: 'apoderado', label: 'Apoderado' },
  { value: 'otro', label: 'Otro' },
]

type EditableRow = {
  // id local estable para keys de React (no se manda al server).
  id: number
  unitCode: string
  fullName: string
  email: string
  phone: string
  relationshipType: Relationship
}

type Phase = 'input' | 'review' | 'done'

const EXAMPLE = `unidad\tnombre\temail\trelación\tteléfono
1A\tJuana Pérez\tjuana@example.com\tprincipal\t1122334455
1A\tCarlos Pérez\tcarlos@example.com\tadicional\t
2B\tMarta Gómez\tmarta@example.com\tprincipal\t`

let idCounter = 0
function nextId() {
  return ++idCounter
}

function blankRow(): EditableRow {
  return { id: nextId(), unitCode: '', fullName: '', email: '', phone: '', relationshipType: 'vecino_principal' }
}

function isRowEmpty(r: EditableRow) {
  return !r.unitCode.trim() && !r.fullName.trim() && !r.email.trim() && !r.phone.trim()
}

export function BulkUnitUsersWizard({ administrationId, propertyId, propertyName }: Props) {
  const [phase, setPhase] = useState<Phase>('input')
  const [pasted, setPasted] = useState('')
  const [rows, setRows] = useState<EditableRow[]>([])
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [result, setResult] = useState<ConfirmBulkResult | null>(null)
  // Vínculo legal por defecto para contactos NUEVOS (sin holder previo con ese
  // email). No se asume: el admin lo elige. Si el contacto ya existe, se respeta.
  const [defaultHolderKind, setDefaultHolderKind] = useState<HolderKind>('propietario')
  const [pending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Revalida en vivo: cada vez que cambian las filas (con un pequeño respiro
  // para no pegarle al server en cada tecla), volvemos a chequear contra la DB.
  useEffect(() => {
    if (phase !== 'review') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void validate(rows)
    }, 600)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, phase])

  async function validate(current: EditableRow[]) {
    const payload = current
      .filter((r) => !isRowEmpty(r))
      .map((r) => ({
        unitCode: r.unitCode,
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        relationshipRaw: r.relationshipType,
      }))
    if (payload.length === 0) {
      setPreview({ rows: [], summary: { total: 0, valid: 0, errors: 0, willCreate: 0, reuseExisting: 0, duplicates: 0 } })
      return
    }
    setValidating(true)
    try {
      const res = await previewBulkUnitUsers({ administrationId, propertyId, rows: payload })
      setPreview(res)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No pudimos revisar la lista.')
    } finally {
      setValidating(false)
    }
  }

  function startFromPaste() {
    if (!pasted.trim()) {
      toast.error('Pegá al menos una fila, o cargá los vecinos a mano.')
      return
    }
    const { rows: parsed } = parsePastedTable(pasted)
    if (parsed.length === 0) {
      toast.error('No reconocimos ninguna fila. Revisá que tenga unidad, nombre y email.')
      return
    }
    setRows(
      parsed.map((p) => ({
        id: nextId(),
        unitCode: p.unitCode,
        fullName: p.fullName,
        email: p.email,
        phone: p.phone,
        relationshipType: (p.relationshipType ?? 'vecino_principal') as Relationship,
      })),
    )
    setPhase('review')
  }

  function startFromScratch() {
    setRows([blankRow(), blankRow(), blankRow()])
    setPhase('review')
  }

  function updateCell(id: number, field: keyof EditableRow, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()])
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  function confirm() {
    if (!preview) return
    const toCreate = preview.rows
      .filter((r) => r.unitId && (r.status === 'will_create' || r.status === 'reuse_existing'))
      .map((r) => ({
        sourceLine: r.sourceLine,
        unitId: r.unitId as string,
        fullName: r.fullName,
        email: r.email,
        phone: r.phone.trim() ? r.phone.trim() : null,
        relationshipType: (r.relationshipType ?? 'vecino_principal') as Relationship,
      }))

    if (toCreate.length === 0) {
      toast.error('No hay vecinos listos para cargar. Corregí las filas marcadas en rojo.')
      return
    }

    startTransition(async () => {
      try {
        const res = await confirmBulkUnitUsers({ administrationId, propertyId, rows: toCreate, defaultHolderKind })
        setResult(res)
        setPhase('done')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No pudimos completar la carga.')
      }
    })
  }

  function resetAll() {
    setPhase('input')
    setPasted('')
    setRows([])
    setPreview(null)
    setResult(null)
  }

  // Mapa de estado por índice (preview alineado 1:1 con las filas no vacías).
  const nonEmpty = rows.filter((r) => !isRowEmpty(r))
  const statusByEditId = new Map<number, PreviewResult['rows'][number]>()
  if (preview) {
    nonEmpty.forEach((r, i) => {
      if (preview.rows[i]) statusByEditId.set(r.id, preview.rows[i])
    })
  }

  // ---------- Resultado final ----------
  if (phase === 'done' && result) {
    return (
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="h-6 w-6" />
          <h2 className="font-serif text-xl font-bold">¡Listo!</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {result.created > 0 && (
            <>Se crearon <strong>{result.created}</strong> vecinos nuevos y les enviamos un mail con su contraseña temporal (la cambian al entrar). </>
          )}
          {result.reused > 0 && (
            <>Se vincularon <strong>{result.reused}</strong> que ya existían. </>
          )}
        </p>
        {result.errors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-medium text-red-800 mb-1">{result.errors.length} fila(s) no se pudieron cargar:</p>
            <ul className="space-y-1 text-red-700">
              {result.errors.map((e, i) => (
                <li key={i}>• {e.email}: {e.message}</li>
              ))}
            </ul>
          </div>
        )}
        <Button onClick={resetAll} variant="outline">
          <RotateCcw className="h-4 w-4 mr-2" /> Cargar más vecinos
        </Button>
      </div>
    )
  }

  // ---------- Paso 1: cómo empezar ----------
  if (phase === 'input') {
    return (
      <div className="space-y-6">
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-lg font-bold">Opción 1: pegar desde Excel</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Copiá las celdas de tu planilla (Ctrl/Cmd + C) y pegalas acá abajo (Ctrl/Cmd + V). Necesitamos cuatro
            columnas: <strong>unidad, nombre, email</strong> y <strong>relación</strong>. El teléfono es opcional.
          </p>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <p className="font-medium mb-2 text-muted-foreground">Así se ve un ejemplo:</p>
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pr-4 pb-1 font-medium">Unidad</th>
                  <th className="pr-4 pb-1 font-medium">Nombre</th>
                  <th className="pr-4 pb-1 font-medium">Email</th>
                  <th className="pr-4 pb-1 font-medium">Relación</th>
                  <th className="pb-1 font-medium">Teléfono</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr><td className="pr-4">1A</td><td className="pr-4">Juana Pérez</td><td className="pr-4">juana@example.com</td><td className="pr-4">principal</td><td>1122334455</td></tr>
                <tr><td className="pr-4">1A</td><td className="pr-4">Carlos Pérez</td><td className="pr-4">carlos@example.com</td><td className="pr-4">adicional</td><td>—</td></tr>
                <tr><td className="pr-4">2B</td><td className="pr-4">Marta Gómez</td><td className="pr-4">marta@example.com</td><td className="pr-4">principal</td><td>—</td></tr>
              </tbody>
            </table>
          </div>

          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'Pegá acá las celdas copiadas de Excel o Google Sheets…'}
            rows={7}
            className="w-full rounded-lg border border-border bg-background p-3 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={startFromPaste}>
              <ArrowLeft className="h-4 w-4 mr-2 rotate-180" /> Revisar la lista
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPasted(EXAMPLE)}>
              Usar datos de ejemplo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            ¿Qué es la <strong>relación</strong>? <strong>Principal</strong> = el vecino responsable de la unidad (el
            que recibe las expensas). <strong>Adicional</strong> = un familiar o conviviente que también quiere acceso.
            Si la dejás vacía, asumimos Principal.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-lg font-bold">Opción 2: cargarlos a mano</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            ¿No tenés una planilla o son pocos? Empezá con una tabla vacía y escribilos uno por uno.
          </p>
          <Button variant="outline" onClick={startFromScratch}>
            <Plus className="h-4 w-4 mr-2" /> Cargar a mano
          </Button>
        </div>
      </div>
    )
  }

  // ---------- Paso 2: revisar + editar ----------
  const summary = preview?.summary
  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-lg font-bold">Revisá la lista — {propertyName}</h2>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {validating && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Revisando…
              </span>
            )}
            {summary && (
              <div className="flex flex-wrap gap-3">
                <span className="text-emerald-700">✓ {summary.willCreate} nuevos</span>
                <span className="text-sky-700">↪ {summary.reuseExisting} ya existen</span>
                {summary.errors > 0 && <span className="text-red-700">✕ {summary.errors} con error</span>}
                {summary.duplicates > 0 && <span className="text-amber-700">⚠ {summary.duplicates} repetidos</span>}
              </div>
            )}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Editá cualquier celda y la lista se revisa sola. Las filas en <span className="text-emerald-700 font-medium">verde</span> están
          listas; corregí las que aparezcan en <span className="text-red-700 font-medium">rojo</span> (o borralas).
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-2 w-8"></th>
                <th className="py-2 pr-2">Unidad</th>
                <th className="py-2 pr-2">Nombre</th>
                <th className="py-2 pr-2">Email</th>
                <th className="py-2 pr-2">Relación</th>
                <th className="py-2 pr-2">Teléfono</th>
                <th className="py-2 pr-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = statusByEditId.get(row.id)
                const empty = isRowEmpty(row)
                const isError = status?.status === 'error'
                const isDup = status?.status === 'duplicate_row'
                const dot = empty
                  ? 'bg-muted'
                  : isError
                  ? 'bg-red-500'
                  : isDup
                  ? 'bg-amber-500'
                  : status
                  ? 'bg-emerald-500'
                  : 'bg-muted'
                const cellBorder = isError ? 'border-red-300' : 'border-border'
                return (
                  <tr key={row.id} className="border-b border-border/50 align-top">
                    <td className="py-2 pr-2">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} title={status?.message ?? ''} />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        value={row.unitCode}
                        onChange={(e) => updateCell(row.id, 'unitCode', e.target.value)}
                        placeholder="1A"
                        className={`w-20 rounded border ${cellBorder} bg-background px-2 py-1`}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        value={row.fullName}
                        onChange={(e) => updateCell(row.id, 'fullName', e.target.value)}
                        placeholder="Nombre y apellido"
                        className={`w-44 rounded border ${cellBorder} bg-background px-2 py-1`}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        value={row.email}
                        onChange={(e) => updateCell(row.id, 'email', e.target.value)}
                        placeholder="email@ejemplo.com"
                        className={`w-52 rounded border ${cellBorder} bg-background px-2 py-1`}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        value={row.relationshipType}
                        onChange={(e) => updateCell(row.id, 'relationshipType', e.target.value)}
                        className="rounded border border-border bg-background px-2 py-1"
                      >
                        <option value="vecino_principal">Principal</option>
                        <option value="vecino_adicional">Adicional</option>
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        value={row.phone}
                        onChange={(e) => updateCell(row.id, 'phone', e.target.value)}
                        placeholder="(opcional)"
                        className="w-32 rounded border border-border bg-background px-2 py-1"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="text-muted-foreground hover:text-red-600 transition-colors"
                        title="Quitar fila"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Motivos de error, en texto claro, para las filas en rojo */}
        {preview && preview.rows.some((r) => r.status === 'error') && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm space-y-1">
            <p className="font-medium text-red-800">Para corregir:</p>
            {nonEmpty.map((r, i) => {
              const st = preview.rows[i]
              if (!st || st.status !== 'error') return null
              return (
                <p key={r.id} className="text-red-700">
                  • {r.fullName || r.email || `Unidad ${r.unitCode}`}: {st.message}
                </p>
              )
            })}
          </div>
        )}

        {summary && summary.willCreate > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm">
            <label className="text-muted-foreground">
              Vínculo legal para los <b className="text-foreground">{summary.willCreate}</b> contactos nuevos:
            </label>
            <select
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              value={defaultHolderKind}
              onChange={(e) => setDefaultHolderKind(e.target.value as HolderKind)}
            >
              {HOLDER_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span className="text-[11px] text-muted-foreground">
              Si el contacto ya existe (mismo email en la unidad), se respeta su vínculo.
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4 mr-2" /> Agregar fila
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={resetAll} disabled={pending}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Volver
          </Button>
          <Button onClick={confirm} disabled={pending || validating || !summary || summary.valid === 0}>
            {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            {summary && summary.valid > 0 ? `Cargar ${summary.valid} vecino${summary.valid === 1 ? '' : 's'}` : 'Cargar vecinos'}
          </Button>
        </div>
        {summary && summary.willCreate > 0 && (
          <p className="text-xs text-muted-foreground">
            Los {summary.willCreate} vecinos nuevos recibirán un mail con su contraseña temporal y la deberán cambiar al ingresar por primera vez.
          </p>
        )}
      </div>
    </div>
  )
}
