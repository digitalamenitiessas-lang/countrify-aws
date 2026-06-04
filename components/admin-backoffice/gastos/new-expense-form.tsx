'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Loader2, Plus, Search, Sparkles, UploadCloud, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { IAdminExpenseKind, IAdminManagedProperty, IAdminProvider } from '@/lib/types'
import { createExpense } from '@/app/iadmin/gastos/actions'
import { extractExpenseFromFile } from '@/app/iadmin/gastos/ai-actions'
import type { ExpenseAnomaly } from '@/lib/iadmin/expense-anomalies'

type Props = {
  administrationId: string
  properties: Pick<IAdminManagedProperty, 'id' | 'displayName' | 'buildingName'>[]
  providers: Pick<IAdminProvider, 'id' | 'name' | 'isActive' | 'defaultCategory' | 'defaultDescription'>[]
  // Unidades activas por consorcio, para cargar un "gasto particular" (cargo
  // asignado a una sola unidad, no prorrateado).
  unitsByProperty?: Record<string, { id: string; code: string; kind: string }[]>
  // Cuentas (banco/caja) por consorcio, para registrar desde dónde se paga el
  // gasto y mantener la caja al día.
  accountsByProperty?: Record<string, { id: string; name: string; isActive: boolean }[]>
}

const DOCUMENT_TYPES = ['Factura A', 'Factura B', 'Factura C', 'Recibo', 'Ticket', 'Nota de crédito', 'Otro']

export function NewExpenseForm({ administrationId, properties, providers, unitsByProperty = {}, accountsByProperty = {} }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [managedPropertyId, setManagedPropertyId] = useState(properties[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState('')
  const [expenseKind, setExpenseKind] = useState<IAdminExpenseKind>('ordinaria')

  // Gasto particular: si se activa, el gasto va entero a una unidad (no se
  // prorratea). Por defecto es un gasto común del edificio.
  const [isParticular, setIsParticular] = useState(false)
  const [unitId, setUnitId] = useState('')

  // Comprobante (tipo + número), para el detalle de egresos de la caja.
  const [documentType, setDocumentType] = useState('')
  const [documentNumber, setDocumentNumber] = useState('')

  // Pago: si se elige una cuenta, registramos el egreso en esa cuenta y la caja
  // queda al día. Por defecto vacío = gasto cargado pero "no pagado" todavía.
  const [cashAccountId, setCashAccountId] = useState('')
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  // Override de saldo: se activa cuando el server devuelve INSUFFICIENT_FUNDS.
  const [overdraftWarning, setOverdraftWarning] = useState<string | null>(null)
  const [allowOverdraft, setAllowOverdraft] = useState(false)

  // Período al que se imputa el gasto. Por defecto el mes en curso, pero el
  // admin puede elegir otro (ej: cargar gastos de mayo cuando ya estamos en junio
  // y el período de mayo sigue abierto).
  const now = new Date()
  const [periodYear, setPeriodYear] = useState<number>(now.getFullYear())
  const [periodMonth, setPeriodMonth] = useState<number>(now.getMonth() + 1)

  // Banner inline para errores que el admin necesita ver en el form (no se le
  // van como toast). Ej: período ya liquidado.
  const [serverError, setServerError] = useState<string | null>(null)

  // Proveedor autocomplete
  const [providerInput, setProviderInput] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<Pick<IAdminProvider, 'id' | 'name'> | null>(null)
  const [providerOpen, setProviderOpen] = useState(false)
  const providerWrapRef = useRef<HTMLDivElement>(null)

  // Documento IA
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [aiFile, setAiFile] = useState<{
    file: File
    base64: string
    preview: string | null
  } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiInfo, setAiInfo] = useState<{ confidence: number | null; model: string } | null>(null)
  const [aiSuggested, setAiSuggested] = useState<Record<string, unknown> | null>(null)
  const [anomalies, setAnomalies] = useState<ExpenseAnomaly[]>([])

  const activeProviders = useMemo(() => providers.filter((p) => p.isActive), [providers])

  const units = unitsByProperty[managedPropertyId] ?? []
  const accounts = accountsByProperty[managedPropertyId] ?? []

  const providerMatches = useMemo(() => {
    const query = providerInput.trim().toLowerCase()
    if (!query) return activeProviders.slice(0, 8)
    return activeProviders.filter((p) => p.name.toLowerCase().includes(query)).slice(0, 8)
  }, [activeProviders, providerInput])

  const canCreateNewProvider = useMemo(() => {
    const query = providerInput.trim()
    if (!query) return false
    if (selectedProvider) return false
    return !activeProviders.some((p) => p.name.toLowerCase() === query.toLowerCase())
  }, [providerInput, selectedProvider, activeProviders])

  if (properties.length === 0) return null

  function reset() {
    setDescription('')
    setAmount('')
    setIssuedAt(new Date().toISOString().slice(0, 10))
    setPeriodYear(now.getFullYear())
    setPeriodMonth(now.getMonth() + 1)
    setCategory('')
    setExpenseKind('ordinaria')
    setIsParticular(false)
    setUnitId('')
    setDocumentType('')
    setDocumentNumber('')
    setCashAccountId('')
    setPaidAt(new Date().toISOString().slice(0, 10))
    setOverdraftWarning(null)
    setAllowOverdraft(false)
    setProviderInput('')
    setSelectedProvider(null)
    setProviderOpen(false)
    setAiFile(null)
    setAiInfo(null)
    setAiSuggested(null)
    setAnomalies([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Strip data:...;base64, prefix
        const idx = result.indexOf(',')
        resolve(idx >= 0 ? result.slice(idx + 1) : result)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  async function handleFilePicked(file: File | null) {
    if (!file) return
    const maxMB = 10
    if (file.size > maxMB * 1024 * 1024) {
      toast.error(`El archivo supera ${maxMB}MB`)
      return
    }
    setAiBusy(true)
    try {
      const base64 = await readFileAsBase64(file)
      const preview = file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : null
      setAiFile({ file, base64, preview })

      const { suggestion, model, anomalies: extractAnomalies } = await extractExpenseFromFile({
        administrationId,
        managedPropertyId,
        fileBase64: base64,
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
      })

      setAiSuggested(suggestion as unknown as Record<string, unknown>)
      setAiInfo({ confidence: suggestion.confidence ?? null, model })
      setAnomalies(extractAnomalies ?? [])

      // Pre-llenar campos
      if (suggestion.amount != null) setAmount(String(suggestion.amount))
      if (suggestion.issued_at) setIssuedAt(suggestion.issued_at)
      if (suggestion.category) setCategory(suggestion.category)
      if (suggestion.description) setDescription(suggestion.description)
      if (suggestion.provider_name) {
        const match = providers.find(
          (p) => p.isActive && p.name.toLowerCase() === suggestion.provider_name!.toLowerCase(),
        )
        if (match) {
          setSelectedProvider({ id: match.id, name: match.name })
          setProviderInput(match.name)
        } else {
          setProviderInput(suggestion.provider_name)
          setSelectedProvider(null)
        }
      }

      const confLabel = suggestion.confidence != null ? `${Math.round(suggestion.confidence)}% confianza` : 'listo'
      toast.success(`Factura leida por IA (${confLabel}) · Revisa y guarda.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Fallo la lectura IA')
      setAiFile(null)
    } finally {
      setAiBusy(false)
    }
  }

  function clearAiFile() {
    setAiFile(null)
    setAiInfo(null)
    setAiSuggested(null)
    setAnomalies([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function pickProvider(p: Pick<IAdminProvider, 'id' | 'name' | 'defaultCategory' | 'defaultDescription'>) {
    setSelectedProvider({ id: p.id, name: p.name })
    setProviderInput(p.name)
    setProviderOpen(false)
    // Precargar categoria si el gasto aun no tiene una
    if (!category && p.defaultCategory) setCategory(p.defaultCategory)
    if (!description && p.defaultDescription) setDescription(p.defaultDescription)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const numericAmount = Number(amount.replace(',', '.'))
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('Monto invalido')
      return
    }
    if (!managedPropertyId) {
      toast.error('Seleccionar un consorcio')
      return
    }
    if (!description.trim()) {
      toast.error('Descripcion obligatoria')
      return
    }
    if (isParticular && !unitId) {
      toast.error('Elegí la unidad del gasto particular')
      return
    }

    const providerPayload = selectedProvider
      ? { providerId: selectedProvider.id, providerName: undefined }
      : providerInput.trim()
        ? { providerId: null, providerName: providerInput.trim() }
        : { providerId: null, providerName: undefined }

    const draftDocument = aiFile
      ? {
          fileBase64: aiFile.base64,
          fileName: aiFile.file.name,
          mimeType: aiFile.file.type || 'application/octet-stream',
          sizeBytes: aiFile.file.size,
          aiSuggestedFields: aiSuggested ?? undefined,
          aiConfidence: aiInfo?.confidence ?? undefined,
          aiProvider: aiInfo?.model ?? 'openrouter',
        }
      : undefined

    startTransition(async () => {
      try {
        const result = await createExpense({
          administrationId,
          managedPropertyId,
          periodYear,
          periodMonth,
          description: description.trim(),
          amount: numericAmount,
          currency: 'ARS',
          issuedAt: issuedAt || null,
          category: category.trim() || null,
          expenseKind,
          unitId: isParticular && unitId ? unitId : null,
          documentType: documentType.trim() || null,
          documentNumber: documentNumber.trim() || null,
          cashAccountId: cashAccountId || null,
          paidAt: cashAccountId ? paidAt || null : null,
          allowOverdraft,
          draftDocument,
          ...providerPayload,
        })
        if (!result.ok) {
          // Saldo insuficiente: en vez del banner de error, ofrecemos forzar el
          // egreso marcando "permitir saldo negativo".
          if (result.code === 'INSUFFICIENT_FUNDS') {
            setOverdraftWarning(result.error)
            return
          }
          setServerError(result.error)
          toast.error('No se pudo cargar el gasto', {
            description: result.error,
            duration: 8000,
          })
          return
        }
        if (result.status === 'imputed') {
          toast.success('Gasto cargado e imputado al periodo')
        } else {
          toast.success('Gasto cargado. Quedo pendiente de aprobacion.')
        }
        setServerError(null)
        reset()
        setOpen(false)
      } catch (error) {
        // Solo errores realmente inesperados (red, runtime). Los de negocio
        // vienen como result.ok = false con mensaje detallado.
        const message =
          error instanceof Error
            ? error.message
            : 'Error inesperado. Intentá de nuevo o avisá al equipo.'
        setServerError(message)
        toast.error('No se pudo cargar el gasto', { description: message, duration: 8000 })
      }
    })
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Cargar gasto
        </Button>
      </div>
    )
  }

  const isPeriodLiquidatedError =
    serverError != null && /ya liquidado|ya cerrado|ya emitida/i.test(serverError)

  return (
    <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-5 space-y-4">
      {serverError ? (
        <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-700 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-rose-900">
            <div className="font-medium">No se pudo cargar el gasto</div>
            <div className="text-xs mt-0.5">{serverError}</div>
            {isPeriodLiquidatedError ? (
              <Link
                href="/iadmin/liquidaciones"
                className="mt-2 inline-block text-xs font-medium underline"
              >
                Ir a Liquidaciones →
              </Link>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setServerError(null)}
            className="text-rose-700 hover:text-rose-900"
            aria-label="Cerrar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Cargar gasto
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Elegí a qué período se imputa. Si la liquidación de ese mes ya fue emitida, no vas
            a poder cargar el gasto.
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            reset()
            setOpen(false)
          }}
        >
          Cancelar
        </button>
      </div>

      {/* Magic: subir factura y que IA autocomplete */}
      <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">Subi la factura y autocompleto</div>
              <div className="text-xs text-muted-foreground">
                Imagen o PDF. La IA lee proveedor, monto, fecha y categoria.
              </div>
              {aiFile ? (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="truncate max-w-[240px] font-medium text-foreground">{aiFile.file.name}</span>
                  {aiInfo?.confidence != null ? (
                    <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">
                      {Math.round(aiInfo.confidence)}% confianza
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={clearAiFile}
                    className="text-muted-foreground hover:text-rose-700 inline-flex items-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              disabled={aiBusy || pending}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                void handleFilePicked(file)
              }}
            />
            <Button
              type="button"
              size="sm"
              variant={aiFile ? 'outline' : 'default'}
              disabled={aiBusy || pending}
              onClick={() => fileInputRef.current?.click()}
            >
              {aiBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Leyendo…
                </>
              ) : aiFile ? (
                <>
                  <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
                  Cambiar
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
                  Subir factura
                </>
              )}
            </Button>
          </div>
        </div>
        {aiFile?.preview ? (
          <div className="mt-3">
            <img
              src={aiFile.preview}
              alt="Preview"
              className="max-h-40 rounded-lg border border-border/50"
            />
          </div>
        ) : null}
      </div>

      {anomalies.length > 0 ? (
        <div className="space-y-2">
          {anomalies.map((a, idx) => {
            const tone =
              a.severity === 'danger'
                ? 'border-rose-300 bg-rose-50 text-rose-900'
                : a.severity === 'warning'
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-sky-200 bg-sky-50 text-sky-900'
            return (
              <div
                key={`${a.code}-${idx}`}
                className={`rounded-lg border px-3 py-2 text-sm ${tone}`}
              >
                <span className="font-medium mr-1">
                  {a.severity === 'danger' ? '⚠' : a.severity === 'warning' ? '⚠' : 'ℹ'}
                </span>
                {a.message}
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {properties.length > 1 ? (
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="property">Consorcio</Label>
            <select
              id="property"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={managedPropertyId}
              onChange={(e) => {
                setManagedPropertyId(e.target.value)
                // La lista de unidades y cuentas cambia por consorcio: limpiamos
                // las selecciones para no apuntar a otra unidad/cuenta.
                setIsParticular(false)
                setUnitId('')
                setCashAccountId('')
              }}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName ?? p.buildingName}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {/* Proveedor: autocomplete con crear inline */}
        <div className="space-y-1.5 md:col-span-2" ref={providerWrapRef}>
          <Label>Proveedor</Label>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8"
                value={providerInput}
                placeholder="Buscar o crear proveedor…"
                onChange={(e) => {
                  setProviderInput(e.target.value)
                  if (selectedProvider && e.target.value !== selectedProvider.name) {
                    setSelectedProvider(null)
                  }
                  setProviderOpen(true)
                }}
                onFocus={() => setProviderOpen(true)}
              />
              {selectedProvider ? (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
              ) : null}
            </div>

            {providerOpen && (providerMatches.length > 0 || canCreateNewProvider) ? (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-background shadow-lg max-h-64 overflow-auto">
                {providerMatches.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between"
                    onClick={() => pickProvider(p)}
                  >
                    <span>{p.name}</span>
                    {p.defaultCategory ? (
                      <span className="text-xs text-muted-foreground">{p.defaultCategory}</span>
                    ) : null}
                  </button>
                ))}
                {canCreateNewProvider ? (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm border-t border-border/50 hover:bg-muted flex items-center gap-2 text-primary"
                    onClick={() => {
                      setProviderOpen(false)
                      setSelectedProvider(null) // queda pending de crear en el server
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Crear proveedor &quot;{providerInput.trim()}&quot;
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Escribí el nombre. Si no existe, lo creamos al guardar el gasto.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Descripcion</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Factura mantenimiento ascensor"
            maxLength={240}
            rows={2}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category">Categoria</Label>
          <Input
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Mantenimiento, seguridad, limpieza..."
            maxLength={80}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="amount">Monto (ARS)</Label>
          <Input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="issuedAt">Fecha de emision</Label>
          <Input id="issuedAt" type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
        </div>

        {/* Comprobante: tipo + número, para el detalle de egresos de la caja. */}
        <div className="space-y-1.5">
          <Label htmlFor="documentType">Tipo de comprobante</Label>
          <select
            id="documentType"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Sin comprobante</option>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="documentNumber">Nº de comprobante</Label>
          <Input
            id="documentNumber"
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            placeholder="0001-00001234"
            maxLength={40}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Período de imputación</Label>
          <div className="flex gap-2">
            <select
              value={periodMonth}
              onChange={(e) => setPeriodMonth(Number(e.target.value))}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((label, idx) => (
                <option key={idx + 1} value={idx + 1}>{label}</option>
              ))}
            </select>
            <select
              value={periodYear}
              onChange={(e) => setPeriodYear(Number(e.target.value))}
              className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Por defecto: mes actual. Cambialo si cargás gastos retroactivos a un período abierto.
          </p>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="kind">Tipo de expensa</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setExpenseKind('ordinaria')}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                expenseKind === 'ordinaria'
                  ? 'bg-slate-100 border-slate-300 text-slate-900 font-medium'
                  : 'border-input text-muted-foreground'
              }`}
            >
              Ordinaria
            </button>
            <button
              type="button"
              onClick={() => setExpenseKind('extraordinaria')}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                expenseKind === 'extraordinaria'
                  ? 'bg-purple-100 border-purple-300 text-purple-900 font-medium'
                  : 'border-input text-muted-foreground'
              }`}
            >
              Extraordinaria
            </button>
          </div>
        </div>

        {/* Gasto particular: cargo asignado a una sola unidad (no prorrateado).
            Default off = gasto común del edificio. */}
        {units.length > 0 ? (
          <div className="space-y-2 md:col-span-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={isParticular}
                onChange={(e) => {
                  setIsParticular(e.target.checked)
                  if (!e.target.checked) setUnitId('')
                }}
              />
              <span className="text-sm">
                <span className="font-medium text-foreground">Es un gasto de una unidad particular</span>
                <span className="block text-[11px] text-muted-foreground">
                  En vez de repartirse entre todos, este gasto se le cobra entero a la unidad que
                  elijas (aparece en &quot;Otros&quot; del boletín de esa unidad).
                </span>
              </span>
            </label>
            {isParticular ? (
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Elegí la unidad…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code}
                    {u.kind ? ` · ${u.kind}` : ''}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ) : null}

        {/* Pago desde una cuenta: registra el egreso en la caja para mantener el
            saldo al día. Opcional — si lo dejás vacío, el gasto queda sin pagar. */}
        {accounts.length > 0 ? (
          <div className="space-y-2 md:col-span-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            <Label htmlFor="cashAccount" className="text-sm font-medium text-foreground">
              Pagar desde una cuenta <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Si elegís una cuenta, descontamos el gasto de su saldo y queda registrado en la caja.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                id="cashAccount"
                value={cashAccountId}
                onChange={(e) => {
                  setCashAccountId(e.target.value)
                  setOverdraftWarning(null)
                  setAllowOverdraft(false)
                }}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">No pagar ahora</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.isActive ? ' · activa' : ''}
                  </option>
                ))}
              </select>
              {cashAccountId ? (
                <Input
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  className="sm:w-44"
                  aria-label="Fecha de pago"
                />
              ) : null}
            </div>
            {overdraftWarning ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
                <p className="text-sm text-amber-900">{overdraftWarning}</p>
                <label className="flex items-center gap-2 text-sm text-amber-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowOverdraft}
                    onChange={(e) => setAllowOverdraft(e.target.checked)}
                  />
                  Permitir saldo negativo y registrar el pago igual
                </label>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={pending || (overdraftWarning !== null && !allowOverdraft)}>
          {pending ? 'Guardando…' : overdraftWarning ? 'Forzar gasto' : 'Guardar gasto'}
        </Button>
      </div>
    </form>
  )
}
