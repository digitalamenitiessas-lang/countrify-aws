'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { CheckCircle2, Loader2, Plus, Search, Sparkles, UploadCloud, X, Zap } from 'lucide-react'
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
}

export function NewExpenseForm({ administrationId, properties, providers }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [managedPropertyId, setManagedPropertyId] = useState(properties[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState('')
  const [expenseKind, setExpenseKind] = useState<IAdminExpenseKind>('ordinaria')

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
    setCategory('')
    setExpenseKind('ordinaria')
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
          description: description.trim(),
          amount: numericAmount,
          currency: 'ARS',
          issuedAt: issuedAt || null,
          category: category.trim() || null,
          expenseKind,
          draftDocument,
          ...providerPayload,
        })
        if (result.status === 'imputed') {
          toast.success('Gasto cargado e imputado al periodo')
        } else {
          toast.success('Gasto cargado. Quedo pendiente de aprobacion.')
        }
        reset()
        setOpen(false)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo crear el gasto')
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

  return (
    <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Cargar gasto
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Queda imputado al periodo abierto del mes en curso.
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
              onChange={(e) => setManagedPropertyId(e.target.value)}
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
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar gasto'}
        </Button>
      </div>
    </form>
  )
}
