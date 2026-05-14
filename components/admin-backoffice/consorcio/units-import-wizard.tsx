'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, Sparkles, UploadCloud, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  analyzeImportColumns,
  importUnitsAndHolders,
  type AnalyzeColumnsResult,
  type ImportResult,
  type ImportTargetField,
} from '@/app/iadmin/consorcios/[id]/importar/actions'

type Props = {
  administrationId: string
  propertyId: string
  propertyName: string
}

type Step = 'upload' | 'map' | 'preview' | 'done'

const TARGET_OPTIONS: Array<{ value: ImportTargetField; label: string }> = [
  { value: 'ignore', label: '— Ignorar —' },
  { value: 'unit_code', label: 'Código de unidad' },
  { value: 'unit_kind', label: 'Tipo de unidad' },
  { value: 'floor', label: 'Piso' },
  { value: 'surface_m2', label: 'Superficie m²' },
  { value: 'prorata_percent', label: 'Alícuota (%)' },
  { value: 'holder_name', label: 'Nombre titular' },
  { value: 'holder_kind', label: 'Tipo titular' },
  { value: 'holder_tax_id', label: 'CUIT / DNI' },
  { value: 'holder_email', label: 'Email' },
  { value: 'holder_phone', label: 'Teléfono' },
]

export function UnitsImportWizard({ administrationId, propertyId, propertyName }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [mapping, setMapping] = useState<Record<string, ImportTargetField>>({})
  const [replaceHolders, setReplaceHolders] = useState(true)
  const [pending, startTransition] = useTransition()
  const [aiBusy, setAiBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function resetAll() {
    setStep('upload')
    setFileName(null)
    setHeaders([])
    setRows([])
    setMapping({})
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFile(file: File) {
    try {
      const arrayBuf = await file.arrayBuffer()
      const wb = XLSX.read(arrayBuf, { type: 'array' })
      const firstSheetName = wb.SheetNames[0]
      if (!firstSheetName) throw new Error('El archivo no tiene hojas')
      const sheet = wb.Sheets[firstSheetName]
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
      if (json.length === 0) {
        toast.error('La hoja está vacía')
        return
      }
      const h = Object.keys(json[0] ?? {})
      if (h.length === 0) throw new Error('No se detectaron columnas')
      setFileName(file.name)
      setHeaders(h)
      setRows(json)

      // Auto-analyze con IA: primeras 5 filas de muestra
      setAiBusy(true)
      try {
        const { mapping: aiMapping } = await analyzeImportColumns({
          administrationId,
          propertyId,
          headers: h,
          sampleRows: json.slice(0, 5),
        })
        setMapping(aiMapping)
        toast.success('IA sugirio el mapeo. Revisá y confirmá.')
      } catch (error) {
        // Mapeo vacio → todos ignore
        setMapping(Object.fromEntries(h.map((col) => [col, 'ignore' as ImportTargetField])))
        toast.error(error instanceof Error ? `IA falló: ${error.message}` : 'IA no pudo mapear')
      } finally {
        setAiBusy(false)
      }

      setStep('map')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo leer el archivo')
    }
  }

  const usedTargets = useMemo(() => {
    const counts = new Map<ImportTargetField, number>()
    for (const v of Object.values(mapping)) {
      if (v === 'ignore') continue
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return counts
  }, [mapping])

  const missingCritical = useMemo(() => {
    const usedSet = new Set(Object.values(mapping))
    const critical: ImportTargetField[] = ['unit_code']
    return critical.filter((c) => !usedSet.has(c))
  }, [mapping])

  function handleConfirmImport() {
    if (missingCritical.length > 0) {
      toast.error('Falta mapear: Código de unidad')
      return
    }
    startTransition(async () => {
      try {
        const r = await importUnitsAndHolders({
          administrationId,
          propertyId,
          mapping,
          rows,
          replaceActiveHolders: replaceHolders,
        })
        setResult(r)
        setStep('done')
        toast.success(`Importadas ${r.unitsCreated} unidades nuevas, ${r.unitsUpdated} actualizadas.`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error en la importación')
      }
    })
  }

  if (step === 'done' && result) {
    return (
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">Importación completa</h3>
            <p className="text-xs text-muted-foreground">
              {propertyName}
              {fileName ? ` · archivo: ${fileName}` : ''}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Unidades nuevas" value={result.unitsCreated} tone="ok" />
          <Stat label="Unidades actualizadas" value={result.unitsUpdated} />
          <Stat label="Titulares nuevos" value={result.holdersCreated} tone="ok" />
          <Stat label="Filas salteadas" value={result.skippedRows.length} tone={result.skippedRows.length > 0 ? 'warning' : 'ok'} />
        </dl>
        {result.skippedRows.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs text-amber-900 font-medium mb-1">
              {result.skippedRows.length} filas no se importaron
            </div>
            <ul className="text-xs text-amber-900 list-disc ml-4 space-y-0.5">
              {result.skippedRows.slice(0, 5).map((s) => (
                <li key={s.index}>Fila {s.index + 1}: {s.reason}</li>
              ))}
              {result.skippedRows.length > 5 ? <li>…y {result.skippedRows.length - 5} más</li> : null}
            </ul>
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button size="sm" onClick={resetAll}>Importar otro archivo</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="flex items-center gap-3 text-xs">
        <StepBadge active={step === 'upload'} done={step !== 'upload'}>1. Subir archivo</StepBadge>
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <StepBadge active={step === 'map'} done={step === 'preview'}>2. Mapear columnas</StepBadge>
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <StepBadge active={step === 'preview'} done={false}>3. Confirmar</StepBadge>
      </div>

      {step === 'upload' ? (
        <div className="glass-card rounded-2xl p-8 text-center space-y-4 border-dashed border-2 border-primary/30">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">Subí tu planilla</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Excel (.xlsx, .xls) o CSV con tus unidades y titulares. La IA mapea las columnas solas.
            </p>
          </div>
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
          <Button onClick={() => fileInputRef.current?.click()}>
            <UploadCloud className="w-4 h-4 mr-1.5" />
            Seleccionar archivo
          </Button>
        </div>
      ) : null}

      {step === 'map' ? (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-medium text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Mapeo sugerido por IA
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Archivo: {fileName} · {rows.length} filas · {headers.length} columnas
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={resetAll}>
                <X className="w-3.5 h-3.5 mr-1" />
                Volver
              </Button>
            </div>
          </div>

          {aiBusy ? (
            <div className="rounded-lg border border-border/40 bg-muted/30 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              IA analizando columnas…
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium">Columna del archivo</th>
                  <th className="text-left px-3 py-2 font-medium">Muestra</th>
                  <th className="text-left px-3 py-2 font-medium">Se importa como</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h) => {
                  const samples = rows.slice(0, 3).map((r) => r[h]).filter(Boolean)
                  const target = mapping[h] ?? 'ignore'
                  const dup = target !== 'ignore' && (usedTargets.get(target) ?? 0) > 1
                  return (
                    <tr key={h} className="border-b border-border/20 last:border-0">
                      <td className="px-3 py-2 font-medium text-foreground">{h}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {samples.length > 0
                          ? samples.slice(0, 2).map((s) => String(s)).join(' · ')
                          : <span className="italic">vacio</span>}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={target}
                          onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as ImportTargetField })}
                          className={`w-full rounded-md border px-2 py-1 text-sm ${
                            dup ? 'border-amber-400 bg-amber-50' : 'border-input bg-background'
                          }`}
                        >
                          {TARGET_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={replaceHolders}
              onChange={(e) => setReplaceHolders(e.target.checked)}
            />
            Reemplazar titulares activos del mismo tipo en cada unidad (recomendado para onboarding inicial)
          </label>

          {missingCritical.length > 0 ? (
            <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              Falta mapear: <b>Código de unidad</b>. Es obligatorio para importar.
            </div>
          ) : null}

          <div className="flex justify-between items-center">
            <Button size="sm" variant="ghost" onClick={() => setStep('upload')}>
              Volver
            </Button>
            <Button
              onClick={() => setStep('preview')}
              disabled={missingCritical.length > 0 || aiBusy}
            >
              Vista previa <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'preview' ? (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="font-medium text-foreground">Vista previa</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Primeras 10 filas tal como se importarían. Revisá y confirmá.
            </p>
          </div>
          <PreviewTable rows={rows.slice(0, 10)} mapping={mapping} />
          <div className="flex justify-between">
            <Button size="sm" variant="ghost" onClick={() => setStep('map')}>
              Volver al mapeo
            </Button>
            <Button onClick={handleConfirmImport} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Importando {rows.length} filas…
                </>
              ) : (
                <>Importar {rows.length} filas</>
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StepBadge({ active, done, children }: { active: boolean; done: boolean; children: React.ReactNode }) {
  const classes = active
    ? 'bg-primary text-primary-foreground'
    : done
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-muted text-muted-foreground'
  return <span className={`px-2.5 py-1 rounded-full font-medium ${classes}`}>{children}</span>
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'ok' | 'warning'
}) {
  const toneClass = tone === 'ok' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : 'text-foreground'
  return (
    <div className="rounded-xl bg-muted/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-serif text-xl font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}

function PreviewTable({
  rows,
  mapping,
}: {
  rows: Array<Record<string, unknown>>
  mapping: Record<string, ImportTargetField>
}) {
  const targetToSource: Record<string, string> = {}
  for (const [source, target] of Object.entries(mapping)) {
    if (target !== 'ignore') targetToSource[target] = source
  }
  const previewCols: Array<{ field: ImportTargetField; label: string }> = [
    { field: 'unit_code', label: 'Código' },
    { field: 'unit_kind', label: 'Tipo' },
    { field: 'floor', label: 'Piso' },
    { field: 'surface_m2', label: 'Superficie' },
    { field: 'prorata_percent', label: 'Alícuota' },
    { field: 'holder_name', label: 'Titular' },
    { field: 'holder_kind', label: 'Tipo tit.' },
    { field: 'holder_tax_id', label: 'CUIT/DNI' },
    { field: 'holder_email', label: 'Email' },
    { field: 'holder_phone', label: 'Tel.' },
  ]
  const cols = previewCols.filter((c) => targetToSource[c.field])

  return (
    <div className="overflow-x-auto rounded-lg border border-border/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
            {cols.map((c) => (
              <th key={c.field} className="text-left px-3 py-2 font-medium">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className="border-b border-border/20 last:border-0">
              {cols.map((c) => (
                <td key={c.field} className="px-3 py-1.5 text-foreground">
                  {String(r[targetToSource[c.field]] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
