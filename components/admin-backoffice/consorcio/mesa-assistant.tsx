'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  FileText,
  FileUp,
  Loader2,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserCircle2,
  UserPlus,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  extractExpenseFromFile,
  type ExtractExpenseFromFileResult,
} from '@/app/iadmin/gastos/ai-actions'
import {
  generateAnnouncement,
  type AnnouncementDraft,
} from '@/app/iadmin/comunicaciones/actions'
import {
  checkExpenseDuplicate,
  importExpenseFromExtraction,
  suggestProviderMatch,
  type DuplicateCandidate,
  type DuplicateCheckResult,
  type ImportExpenseResult,
  type ProviderMatchCandidate,
  type ProviderMatchResult,
} from '@/app/iadmin/consorcios/[id]/planilla/import-actions'

export type MesaAssistantTab = 'menu' | 'extract' | 'predict' | 'announce'

type Props = {
  propertyId: string
  administrationId: string
  year: number
  month: number
  hasPredictions: boolean
  initialTab?: MesaAssistantTab
  draggedFile?: File | null
  onDraggedFileConsumed?: () => void
  onRequestPredictions: () => Promise<void>
  onClose: () => void
}

type Tab = MesaAssistantTab

function formatARSCompact(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
}

const MONTH_LABELS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const MONTH_LABELS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

export function MesaAssistant({
  propertyId,
  administrationId,
  year,
  month,
  hasPredictions,
  initialTab = 'menu',
  draggedFile,
  onDraggedFileConsumed,
  onRequestPredictions,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [pending, startTransition] = useTransition()

  // Extracción de factura
  type DraftFile = { base64: string; fileName: string; mimeType: string; sizeBytes: number }
  const [extractFile, setExtractFile] = useState<DraftFile | null>(null)
  const [extractResult, setExtractResult] = useState<ExtractExpenseFromFileResult | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [match, setMatch] = useState<ProviderMatchResult | null>(null)
  const [matchLoading, setMatchLoading] = useState(false)
  // Selección de proveedor para imputar: existente (id) o nuevo (name)
  const [providerChoice, setProviderChoice] = useState<
    | { kind: 'existing'; id: string; name: string }
    | { kind: 'new'; name: string }
    | null
  >(null)
  const [editAmount, setEditAmount] = useState<string>('')
  const [editPeriod, setEditPeriod] = useState<{ year: number; month: number }>({ year, month })
  const [expenseKind, setExpenseKind] = useState<'ordinaria' | 'extraordinaria'>('ordinaria')
  const [imported, setImported] = useState<ImportExpenseResult | null>(null)
  const [importing, startImporting] = useTransition()
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckResult | null>(null)
  const [duplicateLoading, setDuplicateLoading] = useState(false)
  const [duplicateAcked, setDuplicateAcked] = useState(false)

  // Comunicado
  const [announceTopic, setAnnounceTopic] = useState('')
  const [announceDraft, setAnnounceDraft] = useState<AnnouncementDraft | null>(null)

  const monthLabel = `${MONTH_LABELS_ES[month - 1]} ${year}`

  // Sincronizar tab cuando el padre cambia initialTab (e.g. via command palette)
  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  // Auto-procesar archivo arrastrado por drag&drop
  useEffect(() => {
    if (!draggedFile) return
    setExtractError(null)
    setExtractResult(null)
    setExtractFile(null)
    setImported(null)
    setTab('extract')

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        setExtractError('No se pudo leer el archivo')
        onDraggedFileConsumed?.()
        return
      }
      const base64 = result.split(',')[1] ?? ''
      if (!base64) {
        setExtractError('Archivo vacío')
        onDraggedFileConsumed?.()
        return
      }
      const mimeType = draggedFile.type || 'application/pdf'
      setExtractFile({ base64, fileName: draggedFile.name, mimeType, sizeBytes: draggedFile.size })
      startTransition(async () => {
        try {
          const r = await extractExpenseFromFile({
            administrationId,
            managedPropertyId: propertyId,
            fileBase64: base64,
            mimeType,
            fileName: draggedFile.name,
          })
          setExtractResult(r)
        } catch (error) {
          setExtractError(error instanceof Error ? error.message : 'Error al extraer')
        } finally {
          onDraggedFileConsumed?.()
        }
      })
    }
    reader.onerror = () => {
      setExtractError('Error leyendo el archivo')
      onDraggedFileConsumed?.()
    }
    reader.readAsDataURL(draggedFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggedFile])

  // Cuando aparece un extractResult, inicializamos edición + buscamos match
  useEffect(() => {
    if (!extractResult) {
      setMatch(null)
      setProviderChoice(null)
      setEditAmount('')
      return
    }
    setEditAmount(
      extractResult.suggestion.amount !== undefined && extractResult.suggestion.amount !== null
        ? String(extractResult.suggestion.amount)
        : '',
    )
    // Período: preferir el del mes actual (si no es futuro), si la factura viene de otro mes lo marcamos igual
    const issued = extractResult.suggestion.issued_at
    if (issued && /^\d{4}-\d{2}-\d{2}$/.test(issued)) {
      const [y, m] = issued.split('-').map((n) => Number(n))
      setEditPeriod({ year: y, month: m })
    } else {
      setEditPeriod({ year, month })
    }
    setExpenseKind('ordinaria')

    const providerName = extractResult.suggestion.provider_name?.trim()
    if (!providerName) {
      setProviderChoice(null)
      setMatch(null)
      return
    }
    setMatchLoading(true)
    suggestProviderMatch({ administrationId, providerName })
      .then((m) => {
        setMatch(m)
        if (m.exact) {
          setProviderChoice({ kind: 'existing', id: m.exact.id, name: m.exact.name })
        } else {
          setProviderChoice({ kind: 'new', name: providerName })
        }
      })
      .catch(() => {
        setMatch({ exact: null, candidates: [] })
        setProviderChoice({ kind: 'new', name: providerName })
      })
      .finally(() => setMatchLoading(false))
  }, [extractResult, administrationId, year, month])

  // Auto-check de duplicados con debounce (se dispara cuando tenemos provider + monto + período)
  useEffect(() => {
    if (!extractResult || !providerChoice) {
      setDuplicateCheck(null)
      setDuplicateAcked(false)
      return
    }
    // Sólo tiene sentido chequear si el proveedor es EXISTENTE (un nuevo no puede tener duplicados)
    if (providerChoice.kind !== 'existing') {
      setDuplicateCheck(null)
      setDuplicateAcked(false)
      return
    }
    const amount = Number(editAmount.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) {
      setDuplicateCheck(null)
      return
    }
    setDuplicateLoading(true)
    setDuplicateAcked(false)
    const timer = window.setTimeout(() => {
      checkExpenseDuplicate({
        propertyId,
        year: editPeriod.year,
        month: editPeriod.month,
        providerId: providerChoice.kind === 'existing' ? providerChoice.id : undefined,
        amount,
        issuedAt: extractResult.suggestion.issued_at ?? undefined,
      })
        .then((r) => setDuplicateCheck(r))
        .catch(() => setDuplicateCheck(null))
        .finally(() => setDuplicateLoading(false))
    }, 450)
    return () => {
      window.clearTimeout(timer)
    }
  }, [
    extractResult,
    providerChoice,
    editAmount,
    editPeriod.year,
    editPeriod.month,
    propertyId,
  ])

  function resetExtract() {
    setExtractFile(null)
    setExtractResult(null)
    setExtractError(null)
    setMatch(null)
    setProviderChoice(null)
    setEditAmount('')
    setImported(null)
    setDuplicateCheck(null)
    setDuplicateAcked(false)
  }

  function handleImportExpense() {
    if (!extractResult || !providerChoice) return
    const amount = Number(editAmount.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Ingresá un monto válido')
      return
    }

    // Guard: si hay duplicados sin ack, requerimos confirmación
    const hasUnackedDuplicates =
      duplicateCheck && duplicateCheck.duplicates.length > 0 && !duplicateAcked
    if (hasUnackedDuplicates) {
      toast.error('Revisá el duplicado y confirmá que querés imputar igual.')
      return
    }

    const ackIds = duplicateCheck?.duplicates.map((d) => d.id) ?? []

    startImporting(async () => {
      try {
        const result = await importExpenseFromExtraction({
          propertyId,
          year: editPeriod.year,
          month: editPeriod.month,
          providerId: providerChoice.kind === 'existing' ? providerChoice.id : undefined,
          providerName: providerChoice.kind === 'new' ? providerChoice.name : undefined,
          createProviderIfMissing: providerChoice.kind === 'new',
          ackDuplicateIds: duplicateAcked && ackIds.length > 0 ? ackIds : undefined,
          amount,
          description: extractResult.suggestion.description ?? undefined,
          issuedAt: extractResult.suggestion.issued_at ?? undefined,
          dueAt: extractResult.suggestion.due_at ?? undefined,
          expenseKind,
          category: extractResult.suggestion.category ?? undefined,
          file: extractFile
            ? {
                fileBase64: extractFile.base64,
                fileName: extractFile.fileName,
                mimeType: extractFile.mimeType,
                sizeBytes: extractFile.sizeBytes,
                aiSuggestedFields: extractResult.suggestion as any,
                aiProvider: 'openrouter',
              }
            : undefined,
        })
        setImported(result)
        toast.success(
          result.imputed
            ? `Imputado a ${MONTH_LABELS_ES[editPeriod.month - 1]} · $ ${formatARSCompact(amount)}`
            : 'Gasto enviado a revisión',
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al imputar')
      }
    })
  }

  function handlePredict() {
    startTransition(async () => {
      try {
        await onRequestPredictions()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setExtractError(null)
    setExtractResult(null)
    setExtractFile(null)
    setImported(null)

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        setExtractError('No se pudo leer el archivo')
        return
      }
      const base64 = result.split(',')[1] ?? ''
      if (!base64) {
        setExtractError('Archivo vacío')
        return
      }
      const mimeType = file.type || 'application/pdf'
      setExtractFile({ base64, fileName: file.name, mimeType, sizeBytes: file.size })
      startTransition(async () => {
        try {
          const r = await extractExpenseFromFile({
            administrationId,
            managedPropertyId: propertyId,
            fileBase64: base64,
            mimeType,
            fileName: file.name,
          })
          setExtractResult(r)
        } catch (error) {
          setExtractError(error instanceof Error ? error.message : 'Error al extraer')
        }
      })
    }
    reader.onerror = () => setExtractError('Error leyendo el archivo')
    reader.readAsDataURL(file)
  }

  function handleGenerateAnnouncement() {
    if (announceTopic.trim().length < 5) {
      toast.error('Describí un poco más el tema')
      return
    }
    startTransition(async () => {
      try {
        const draft = await generateAnnouncement({
          administrationId,
          managedPropertyId: propertyId,
          topic: announceTopic.trim(),
        })
        setAnnounceDraft(draft)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al redactar')
      }
    })
  }

  async function handleCopy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copiado`)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <aside className="mesa-card mesa-fade-in overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <header className="px-5 py-3 border-b border-border/30 flex items-center justify-between bg-gradient-to-r from-primary/8 to-primary/0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-serif text-base font-semibold text-foreground">Asistente</h3>
          <span className="text-[10px] text-muted-foreground">
            {tab === 'menu' ? `· ${monthLabel}` : null}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {tab !== 'menu' ? (
            <Button size="sm" variant="ghost" onClick={() => setTab('menu')} className="text-xs">
              ← Volver
            </Button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 hover:bg-muted text-muted-foreground"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {tab === 'menu' ? (
        <div className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
          <AssistantCard
            icon={TrendingUp}
            title="Sugerir montos del mes"
            description={
              hasPredictions
                ? 'Ya hay sugerencias aplicadas. Podés volver a pedirlas.'
                : 'La IA analiza el historial y sugiere un monto por proveedor.'
            }
            onClick={handlePredict}
            pending={pending}
          />
          <AssistantCard
            icon={FileUp}
            title="Extraer de documento"
            description="Subí una factura PDF o imagen y la IA te devuelve los campos listos para cargar."
            onClick={() => setTab('extract')}
          />
          <AssistantCard
            icon={MessageSquare}
            title="Redactar comunicado"
            description="La IA te genera un borrador (email, cartelera, WhatsApp)."
            onClick={() => setTab('announce')}
          />
        </div>
      ) : null}

      {tab === 'extract' ? (
        <div className="p-4 space-y-3">
          {imported ? (
            <ImportSuccess
              result={imported}
              periodLabel={`${MONTH_LABELS_ES[editPeriod.month - 1]} ${editPeriod.year}`}
              amount={Number(editAmount.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))}
              onAnother={resetExtract}
              onClose={onClose}
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Subí una factura (PDF o imagen). La IA extrae los datos y vos confirmás la imputación al rubro y al mes.
              </p>
              <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground hover:bg-muted/30 w-full justify-center transition-colors">
                <FileUp className="w-4 h-4" />
                {pending && !extractResult ? 'Procesando…' : extractFile ? 'Cambiar archivo' : 'Seleccionar archivo'}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={handleFile}
                  disabled={pending}
                />
              </label>
              {extractFile && !pending ? (
                <p className="text-[10px] text-muted-foreground truncate">
                  {extractFile.fileName}
                </p>
              ) : null}

              {extractError ? (
                <div className="flex items-start gap-2 rounded-lg border border-rose-300/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/45 dark:text-rose-100">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
                  <span>{extractError}</span>
                </div>
              ) : null}

              {extractResult ? (
                <>
                  {/* Fields extraídos */}
                  <div className="rounded-lg border border-border/40 bg-muted/10 p-3 text-sm space-y-1 mesa-fade-in">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                      Datos extraídos por la IA
                    </p>
                    <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs mt-1">
                      <span className="text-muted-foreground">Proveedor</span>
                      <span className="font-medium">{extractResult.suggestion.provider_name ?? '—'}</span>
                      <span className="text-muted-foreground">Emisión</span>
                      <span className="font-medium">{extractResult.suggestion.issued_at ?? '—'}</span>
                      <span className="text-muted-foreground">Vencimiento</span>
                      <span className="font-medium">{extractResult.suggestion.due_at ?? '—'}</span>
                    </div>
                    {extractResult.anomalies && extractResult.anomalies.length > 0 ? (
                      <div className="mt-2 pt-2 border-t border-border/30 space-y-1">
                        {extractResult.anomalies.map((a, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-amber-900">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{a.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Match de proveedor */}
                  <ProviderMatchCard
                    extractedName={extractResult.suggestion.provider_name ?? ''}
                    match={match}
                    loading={matchLoading}
                    choice={providerChoice}
                    onChangeChoice={setProviderChoice}
                  />

                  {/* Edición de monto + período */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                        Monto
                      </Label>
                      <Input
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        placeholder="0"
                        inputMode="decimal"
                        className="text-right tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                        Imputar al mes
                      </Label>
                      <MonthPicker
                        year={editPeriod.year}
                        month={editPeriod.month}
                        onChange={(y, m) => setEditPeriod({ year: y, month: m })}
                      />
                    </div>
                  </div>

                  {/* Tipo de gasto */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                      Tipo
                    </span>
                    <div className="seg" role="group" aria-label="Tipo de gasto">
                      <button
                        type="button"
                        aria-pressed={expenseKind === 'ordinaria'}
                        onClick={() => setExpenseKind('ordinaria')}
                      >
                        Ordinaria
                      </button>
                      <button
                        type="button"
                        aria-pressed={expenseKind === 'extraordinaria'}
                        onClick={() => setExpenseKind('extraordinaria')}
                      >
                        Extraordinaria
                      </button>
                    </div>
                  </div>

                  {/* Detección de duplicados */}
                  {duplicateLoading ? (
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Verificando si ya existe un gasto similar…
                    </div>
                  ) : null}

                  {duplicateCheck && duplicateCheck.duplicates.length > 0 ? (
                    <DuplicateWarning
                      check={duplicateCheck}
                      acked={duplicateAcked}
                      onToggleAck={() => setDuplicateAcked((v) => !v)}
                      onOpenDocument={() => {}}
                    />
                  ) : null}

                  <Button
                    size="sm"
                    className={`w-full ${
                      duplicateCheck && duplicateCheck.duplicates.length > 0 && duplicateAcked
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : ''
                    }`}
                    onClick={handleImportExpense}
                    disabled={
                      importing ||
                      !providerChoice ||
                      !editAmount ||
                      (duplicateCheck !== null && duplicateCheck.duplicates.length > 0 && !duplicateAcked)
                    }
                  >
                    {importing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Imputando…
                      </>
                    ) : duplicateCheck && duplicateCheck.duplicates.length > 0 && duplicateAcked ? (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
                        Imputar igual (duplicado asumido)
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                        Imputar como gasto
                      </>
                    )}
                  </Button>

                  <p className="text-[9px] text-muted-foreground text-center">
                    Modelo: {extractResult.model}
                  </p>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {tab === 'announce' ? (
        <div className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tema</Label>
            <Textarea
              rows={3}
              value={announceTopic}
              onChange={(e) => setAnnounceTopic(e.target.value)}
              placeholder="Ej. Aumento de expensas por actualización paritaria de encargado"
            />
          </div>
          <Button size="sm" onClick={handleGenerateAnnouncement} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Redactando…
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generar borrador
              </>
            )}
          </Button>

          {announceDraft ? (
            <div className="space-y-2">
              <DraftBlock
                title="WhatsApp"
                body={announceDraft.whatsapp}
                onCopy={() => handleCopy(announceDraft.whatsapp, 'WhatsApp')}
              />
              <DraftBlock
                title="Email"
                subject={announceDraft.subjectSuggestion}
                body={announceDraft.email}
                onCopy={() => handleCopy(announceDraft.email, 'Email')}
              />
              <DraftBlock
                title="Cartelera / formal"
                body={announceDraft.formal}
                onCopy={() => handleCopy(announceDraft.formal, 'Formal')}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <footer className="px-4 py-2 border-t border-border/30 text-[10px] text-muted-foreground text-center italic">
        La IA sugiere, vos decidís. Nada se guarda sin tu confirmación.
      </footer>
    </aside>
  )
}

function AssistantCard({
  icon: Icon,
  title,
  description,
  onClick,
  pending,
}: {
  icon: typeof Sparkles
  title: string
  description: string
  onClick: () => void
  pending?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-left rounded-xl border border-border/40 bg-background p-3 hover:border-primary/40 hover:bg-muted/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
        </div>
        <span className="font-medium text-sm">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  )
}

function DraftBlock({
  title,
  subject,
  body,
  onCopy,
}: {
  title: string
  subject?: string
  body: string
  onCopy: () => void
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium">{title}</span>
        <button
          type="button"
          onClick={onCopy}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <Copy className="w-3 h-3" /> Copiar
        </button>
      </div>
      {subject ? (
        <p className="text-[11px] text-muted-foreground mb-1">
          <span className="font-medium">Asunto:</span> {subject}
        </p>
      ) : null}
      <pre className="text-xs whitespace-pre-wrap font-sans text-foreground max-h-48 overflow-y-auto">
        {body}
      </pre>
    </div>
  )
}

// ----------------------------------------------------------------------------
// ProviderMatchCard
// ----------------------------------------------------------------------------

type ProviderChoice =
  | { kind: 'existing'; id: string; name: string }
  | { kind: 'new'; name: string }

function ProviderMatchCard({
  extractedName,
  match,
  loading,
  choice,
  onChangeChoice,
}: {
  extractedName: string
  match: ProviderMatchResult | null
  loading: boolean
  choice: ProviderChoice | null
  onChangeChoice: (c: ProviderChoice) => void
}) {
  if (!extractedName) {
    return (
      <div className="rounded-lg border border-amber-300/60 bg-amber-500/10 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
        La IA no detectó el nombre del proveedor. Escribilo para continuar:
        <input
          type="text"
          className="mt-1.5 w-full rounded-md border border-amber-300/70 bg-background px-2 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground dark:border-amber-800/70"
          placeholder="Nombre del proveedor"
          onChange={(e) => onChangeChoice({ kind: 'new', name: e.target.value })}
          value={choice?.kind === 'new' ? choice.name : ''}
        />
      </div>
    )
  }

  const tone = match?.exact ? 'success' : 'neutral'
  const toneClass =
    tone === 'success'
      ? 'border-emerald-300/50 bg-emerald-500/10 dark:border-emerald-900/60 dark:bg-emerald-950/30'
      : 'border-border/40 bg-muted/10'

  return (
    <div className={`rounded-lg border ${toneClass} p-3 space-y-2 text-sm`}>
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
        Proveedor
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Buscando en tu catálogo…
        </div>
      ) : match?.exact ? (
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">
              {match.exact.name}
              <span className="ml-1.5 text-[10px] uppercase tracking-[0.08em] text-emerald-700">existente</span>
            </p>
            {match.exact.category ? (
              <p className="text-[11px] text-muted-foreground">{match.exact.category}</p>
            ) : null}
            {match.candidates.length > 0 ? (
              <details className="mt-1">
                <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                  o elegir otro existente
                </summary>
                <div className="mt-1.5 space-y-1">
                  {match.candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onChangeChoice({ kind: 'existing', id: c.id, name: c.name })}
                      className={`w-full text-left rounded-md border px-2 py-1 text-xs transition-colors ${
                        choice?.kind === 'existing' && choice.id === c.id
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border/40 bg-background hover:border-primary/30'
                      }`}
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.category ? (
                        <span className="ml-1.5 text-muted-foreground">· {c.category}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            <span className="italic">{extractedName}</span> no está en tu catálogo.
          </p>
          <div className="space-y-1">
            {match && match.candidates.length > 0 ? (
              <>
                <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium mt-1">
                  ¿Es uno de estos?
                </p>
                {match.candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onChangeChoice({ kind: 'existing', id: c.id, name: c.name })}
                    className={`w-full text-left rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      choice?.kind === 'existing' && choice.id === c.id
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/40 bg-background hover:border-primary/30'
                    }`}
                  >
                    <span className="font-medium">{c.name}</span>
                    {c.category ? (
                      <span className="ml-1.5 text-muted-foreground">· {c.category}</span>
                    ) : null}
                  </button>
                ))}
              </>
            ) : null}
            <button
              type="button"
              onClick={() => onChangeChoice({ kind: 'new', name: extractedName })}
              className={`w-full text-left rounded-md border px-2 py-1.5 text-xs transition-colors inline-flex items-center gap-1.5 ${
                choice?.kind === 'new'
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border/40 bg-background hover:border-primary/30'
              }`}
            >
              <UserPlus className="w-3 h-3 shrink-0" />
              <span className="font-medium">Crear nuevo proveedor:</span>
              <span className="italic text-muted-foreground truncate">{extractedName}</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// MonthPicker: chip con año + select de mes
// ----------------------------------------------------------------------------

function MonthPicker({
  year,
  month,
  onChange,
}: {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // Generamos 24 opciones: 12 meses hacia atrás + mes actual + 6 adelante
  const options: Array<{ y: number; m: number; label: string; isPast: boolean; isCurrent: boolean }> = []
  for (let delta = -18; delta <= 3; delta++) {
    const d = new Date(currentYear, currentMonth - 1 + delta, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    options.push({
      y,
      m,
      label: `${MONTH_LABELS_SHORT[m - 1]} ${String(y).slice(2)}`,
      isPast: delta < 0,
      isCurrent: delta === 0,
    })
  }
  options.reverse() // Más recientes primero

  const value = `${year}-${month}`
  return (
    <select
      value={value}
      onChange={(e) => {
        const [y, m] = e.target.value.split('-').map((n) => Number(n))
        onChange(y, m)
      }}
      className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5 text-sm focus:outline-none focus:border-primary/40 focus:shadow-[0_0_0_3px_rgba(17, 34, 80,0.08)] transition-shadow capitalize"
    >
      {options.map((o) => (
        <option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>
          {o.label} {o.isCurrent ? '· actual' : ''}
        </option>
      ))}
    </select>
  )
}

// ----------------------------------------------------------------------------
// ImportSuccess
// ----------------------------------------------------------------------------

function ImportSuccess({
  result,
  periodLabel,
  amount,
  onAnother,
  onClose,
}: {
  result: ImportExpenseResult
  periodLabel: string
  amount: number
  onAnother: () => void
  onClose: () => void
}) {
  return (
    <div className="mesa-fade-in space-y-3">
      <div className="rounded-xl border border-emerald-300/50 bg-emerald-500/10 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-100">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-serif text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              {result.imputed ? 'Gasto imputado' : 'Gasto en revisión'}
            </h4>
            <p className="mt-0.5 text-xs text-emerald-900/80 dark:text-emerald-100/80">
              {result.providerName ? (
                <>
                  <span className="font-medium">{result.providerName}</span>
                  {result.providerCreated ? ' · creado como proveedor nuevo' : ''}
                </>
              ) : null}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-emerald-900/60 dark:text-emerald-100/60">
                  Período
                </span>
                <p className="font-medium capitalize text-emerald-900 dark:text-emerald-100">{periodLabel}</p>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-emerald-900/60 dark:text-emerald-100/60">
                  Monto
                </span>
                <p className="font-medium tabular-nums text-emerald-900 dark:text-emerald-100">
                  $ {formatARSCompact(amount)}
                </p>
              </div>
            </div>
            {!result.imputed ? (
              <p className="mt-2 text-[11px] italic text-emerald-900/70 dark:text-emerald-100/70">
                Tu rol no puede imputar directamente. El gasto quedó en revisión para un administrador con permiso de aprobación.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onAnother} className="flex-1">
          Imputar otra factura
        </Button>
        <Button size="sm" onClick={onClose} className="flex-1">
          Cerrar asistente
        </Button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// DuplicateWarning — aviso cuando la factura matchea con un gasto ya cargado
// ----------------------------------------------------------------------------

const STATUS_LABEL_ES: Record<string, string> = {
  draft: 'borrador',
  pending_review: 'en revisión',
  needs_doc: 'falta doc',
  approved: 'aprobado',
  imputed: 'imputado',
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function DuplicateWarning({
  check,
  acked,
  onToggleAck,
}: {
  check: DuplicateCheckResult
  acked: boolean
  onToggleAck: () => void
  onOpenDocument?: (documentId: string) => void
}) {
  const tone = check.hasExact ? 'hard' : 'soft'
  const cardClass =
    tone === 'hard'
      ? 'border-rose-300/60 bg-rose-500/10 dark:border-rose-900/70 dark:bg-rose-950/45'
      : 'border-amber-300/60 bg-amber-500/10 dark:border-amber-900/70 dark:bg-amber-950/45'
  const iconBg =
    tone === 'hard'
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-100'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-100'
  const title = check.hasExact
    ? 'Posible factura duplicada'
    : 'Posible factura ya cargada en este mes'
  const description = check.hasExact
    ? 'Ya hay un gasto exacto en el mismo período. Verificá antes de imputar.'
    : 'Encontramos uno o más gastos similares del mismo proveedor en este mes.'

  return (
    <div className={`rounded-lg border ${cardClass} p-3 space-y-2 mesa-fade-in`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {check.duplicates.slice(0, 3).map((d) => (
          <li key={d.id} className="rounded-md border border-border/40 bg-background px-2.5 py-1.5 text-[11px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium tabular-nums">$ {formatARSCompact(d.amount)}</span>
              <span className="text-muted-foreground flex items-center gap-1">
                {d.hasDocument ? <FileText className="w-2.5 h-2.5" /> : null}
                <span className="uppercase tracking-[0.06em] text-[9px]">
                  {STATUS_LABEL_ES[d.status] ?? d.status}
                </span>
              </span>
            </div>
            {d.description ? (
              <p className="text-muted-foreground truncate italic text-[10px]">{d.description}</p>
            ) : null}
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
              {d.issuedAt ? (
                <span>emitida {formatDateShort(d.issuedAt)}</span>
              ) : null}
              {d.createdByName ? (
                <span className="inline-flex items-center gap-0.5">
                  <UserCircle2 className="w-2.5 h-2.5" />
                  {d.createdByName}
                </span>
              ) : null}
              {d.reasons.length > 0 ? (
                <span className="text-foreground">· {d.reasons.join(' · ')}</span>
              ) : null}
            </div>
          </li>
        ))}
        {check.duplicates.length > 3 ? (
          <li className="text-[10px] text-muted-foreground text-center italic">
            +{check.duplicates.length - 3} más en la planilla
          </li>
        ) : null}
      </ul>

      <label className="flex items-start gap-2 rounded-md bg-background/60 px-2.5 py-1.5 border border-border/40 cursor-pointer hover:border-primary/40 transition-colors">
        <input
          type="checkbox"
          checked={acked}
          onChange={onToggleAck}
          className="mt-0.5 accent-primary"
        />
        <span className="text-[11px] text-foreground leading-snug">
          Es un gasto distinto al que ya está cargado. Imputar igual.
        </span>
      </label>
    </div>
  )
}
