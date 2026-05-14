'use client'

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Camera,
  CheckCircle2,
  CircleHelp,
  CircleUserRound,
  Gift,
  History,
  Home,
  ImagePlus,
  Plus,
  QrCode,
  ScanLine,
  ShieldAlert,
  Store,
  Tag,
  Upload,
  X,
} from 'lucide-react'
import jsQR from 'jsqr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { PromotionCard } from '@/components/promotion-card'
import { ImageUploadField } from '@/components/image-upload-field'
import { ChatWidget } from '@/components/ai/chat-widget'
import DynamicMap from '@/components/map/map-view-dynamic'
import { IMAGE_RULES, CATEGORIES } from '@/lib/constants'
import type {
  Building,
  Business,
  BusinessDashboardData,
  BusinessDashboardSection,
  BusinessScannerState,
  Promotion,
  PromotionMonthlyStatus,
  PromotionRedemptionHistoryItem,
  PromotionRedemptionValidationResult,
} from '@/lib/types'
import { createClientUuid } from '@/lib/utils'

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>
}

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike
}

const BUSINESS_SECTION_OPTIONS: BusinessDashboardSection[] = ['home', 'promotions', 'scanner', 'history', 'profile']
const BUSINESS_TOUR_STORAGE_KEY = 'countrify-business-tour-v1'

const BUSINESS_TOUR_STEPS_DESKTOP: Array<{
  selector: string
  title: string
  description: string
}> = [
  {
    selector: '[data-tour="business-tour-relaunch"]',
    title: 'Tour guiado',
    description: 'Puedes volver a abrir este recorrido cuando quieras para repasar el panel del negocio.',
  },
  {
    selector: '[data-tour="business-nav-home"]',
    title: 'Inicio',
    description: 'Aqui ves el estado del mes, el cumplimiento de promociones y un resumen rapido de actividad.',
  },
  {
    selector: '[data-tour="business-nav-promotions"]',
    title: 'Promos',
    description: 'Desde esta seccion creas, editas y repites promociones para mantener tu negocio activo.',
  },
  {
    selector: '[data-tour="business-nav-scanner"]',
    title: 'Escanear',
    description: 'Este acceso central abre directamente el scanner QR para validar canjes al instante.',
  },
  {
    selector: '[data-tour="business-scanner-section"]',
    title: 'Validacion express',
    description: 'Aqui puedes escanear el QR del vecino o ingresar el codigo manualmente sin distraerte con otras tareas.',
  },
  {
    selector: '[data-tour="business-nav-history"]',
    title: 'Historial',
    description: 'Aqui revisas canjes validados y promociones anteriores para reutilizarlas despues.',
  },
  {
    selector: '[data-tour="business-nav-profile"]',
    title: 'Perfil',
    description: 'Actualiza la identidad de tu negocio, su logo y la ubicacion visible para los residentes.',
  },
]

const BUSINESS_TOUR_STEPS_MOBILE = BUSINESS_TOUR_STEPS_DESKTOP

function isBusinessDashboardSection(value: string | null): value is BusinessDashboardSection {
  return Boolean(value && BUSINESS_SECTION_OPTIONS.includes(value as BusinessDashboardSection))
}

interface PromotionFormState {
  id?: string
  title: string
  description: string
  discount: string
  category: string
  expirationDate: string
  buildingId: string | null
  publishedMonth: string
  sourcePromotionId: string | null
}

function getCurrentMonthStart() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

function getPreviousMonthStart(monthStart: string) {
  const date = new Date(`${monthStart}T00:00:00.000Z`)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
}

function getMonthEnd(monthStart: string) {
  const date = new Date(`${monthStart}T00:00:00.000Z`)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
}

function buildAutoRenewedPromotion(promotion: Promotion, referenceMonthStart: string): Promotion {
  const monthEnd = getMonthEnd(referenceMonthStart)
  return {
    ...promotion,
    publishedMonth: referenceMonthStart,
    expirationDate: promotion.expirationDate > monthEnd ? promotion.expirationDate : monthEnd,
    sourcePromotionId: promotion.sourcePromotionId ?? promotion.id,
  }
}

function applyPromotionAutoRenewal(promotions: Promotion[], referenceMonthStart: string): Promotion[] {
  const currentByBusiness = new Set(
    promotions.filter((promotion) => promotion.publishedMonth === referenceMonthStart).map((promotion) => promotion.businessId),
  )

  const latestActiveByBusiness = new Map<string, Promotion>()
  for (const promotion of [...promotions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!promotion.isActive || currentByBusiness.has(promotion.businessId) || latestActiveByBusiness.has(promotion.businessId)) continue
    latestActiveByBusiness.set(promotion.businessId, promotion)
  }

  if (latestActiveByBusiness.size === 0) {
    return promotions
  }

  return promotions.map((promotion) => {
    const fallbackPromotion = latestActiveByBusiness.get(promotion.businessId)
    if (!fallbackPromotion || fallbackPromotion.id !== promotion.id) {
      return promotion
    }
    return buildAutoRenewedPromotion(promotion, referenceMonthStart)
  })
}

function formatMonthLabel(monthStart: string) {
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${monthStart}T00:00:00.000Z`))
}

function buildMonthlyStatus(promotions: Promotion[], referenceMonthStart: string): PromotionMonthlyStatus {
  const effectivePromotions = applyPromotionAutoRenewal(promotions, referenceMonthStart)
  const previousMonthStart = getPreviousMonthStart(referenceMonthStart)
  const promotionsThisMonth = effectivePromotions.filter((promotion) => promotion.publishedMonth === referenceMonthStart)
  const lastMonthPromotion =
    [...effectivePromotions]
      .filter((promotion) => promotion.publishedMonth === previousMonthStart)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  const autoRenewedPromotion =
    promotionsThisMonth.find((promotion) => {
      const original = promotions.find((item) => item.id === promotion.id)
      return original ? original.publishedMonth !== referenceMonthStart : false
    }) ?? null

  return {
    monthStart: referenceMonthStart,
    monthLabel: formatMonthLabel(referenceMonthStart),
    isCompliant: promotionsThisMonth.length > 0,
    promotionsThisMonth: promotionsThisMonth.length,
    lastMonthPromotion,
    isAutoRenewed: Boolean(autoRenewedPromotion),
    autoRenewedPromotion,
  }
}

function emptyPromotionState(monthStart: string): PromotionFormState {
  return {
    title: '',
    description: '',
    discount: '',
    category: CATEGORIES[1],
    expirationDate: getMonthEnd(monthStart),
    buildingId: null,
    publishedMonth: monthStart,
    sourcePromotionId: null,
  }
}

async function uploadBusinessAsset(params: {
  kind: 'business-logo' | 'promotion-image'
  businessId: string
  recordId: string
  file: File
}) {
  const response = await fetch('/api/uploads/business-asset-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      kind: params.kind,
      businessId: params.businessId,
      recordId: params.recordId,
      fileName: params.file.name,
      contentType: params.file.type || 'application/octet-stream',
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.uploadUrl || !payload?.objectKey || !payload?.publicUrl) {
    throw new Error(payload?.error ?? 'No pudimos preparar la imagen para subir.')
  }

  const uploadResponse = await fetch(payload.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': params.file.type || 'application/octet-stream',
    },
    body: params.file,
  })

  if (!uploadResponse.ok) {
    throw new Error('No pudimos subir la imagen a S3.')
  }

  return {
    path: payload.objectKey as string,
    url: payload.publicUrl as string,
  }
}

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null)
}

function MonthBadge({ monthStart }: { monthStart: string }) {
  return (
    <span className="inline-flex rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary">
      {formatMonthLabel(monthStart)}
    </span>
  )
}

function SectionHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      {onBack ? (
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
      ) : null}
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
    </div>
  )
}

function ValidationResultCard({ result }: { result: PromotionRedemptionValidationResult }) {
  const tone = result.status === 'redeemed' ? 'success' : result.status === 'already_used' ? 'warn' : 'error'

  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === 'success'
          ? 'border-emerald-200 bg-emerald-50/80'
          : tone === 'warn'
            ? 'border-amber-200 bg-amber-50/80'
            : 'border-rose-200 bg-rose-50/80'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${
            tone === 'success' ? 'bg-emerald-100 text-emerald-700' : tone === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
          }`}
        >
          {tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{result.message}</p>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {result.promotionTitle ? <p>Promocion: {result.promotionTitle}</p> : null}
            {result.neighborName ? <p>Vecino: {result.neighborName}</p> : null}
            {result.redeemedAt ? <p>Fecha: {new Date(result.redeemedAt).toLocaleString('es-AR')}</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function PromotionModal({
  buildings,
  initial,
  mode,
  monthLabel,
  onClose,
  onSave,
}: {
  buildings: Building[]
  initial: PromotionFormState
  mode: 'create' | 'edit'
  monthLabel: string
  onClose: () => void
  onSave: (state: PromotionFormState, file: File | null) => Promise<void>
}) {
  const [form, setForm] = useState<PromotionFormState>(initial)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      await onSave(form, imageFile)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const title = mode === 'edit' ? 'Editar promocion' : 'Nueva promocion del mes'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(10,6,2,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border/60 bg-background shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Cerrar modal"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="border-b border-border/60 px-7 pb-5 pt-7">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <MonthBadge monthStart={form.publishedMonth} />
            {form.sourcePromotionId ? (
              <span className="inline-flex rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                Copia editable
              </span>
            ) : null}
          </div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {`Publica una promocion para ${monthLabel} con imagen, alcance y vencimiento persistidos en Supabase.`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-7 py-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Titulo</Label>
              <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Descuento</Label>
              <Input value={form.discount} onChange={(event) => setForm((prev) => ({ ...prev, discount: event.target.value }))} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descripcion</Label>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
              required
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <select
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              >
                {CATEGORIES.filter((category) => category !== 'Todas').map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Vencimiento</Label>
              <Input type="date" value={form.expirationDate} min={form.publishedMonth} onChange={(event) => setForm((prev) => ({ ...prev, expirationDate: event.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Country exclusivo</Label>
              <select
                value={form.buildingId ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, buildingId: event.target.value || null }))}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Toda la red Countrify</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ImageUploadField
            label={IMAGE_RULES.promotion.label}
            helpText={IMAGE_RULES.promotion.recommended}
            maxSizeMb={IMAGE_RULES.promotion.maxSizeMb}
            minWidth={IMAGE_RULES.promotion.minWidth}
            minHeight={IMAGE_RULES.promotion.minHeight}
            valueUrl={null}
            onFileChange={setImageFile}
          />

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 btn-premium" disabled={loading}>
              {loading ? 'Guardando...' : mode === 'edit' ? 'Guardar cambios' : 'Publicar promocion'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ScannerStatusCopy({ state }: { state: BusinessScannerState }) {
  const copy: Record<BusinessScannerState, string> = {
    idle: 'Abre la camara para leer un QR del vecino o usa el codigo manual.',
    starting: 'Preparando la camara del dispositivo...',
    scanning: 'Apunta al QR del vecino. Cuando detectemos el codigo frenamos el scanner automaticamente.',
    unsupported: 'Este navegador no permite escanear QR de forma nativa. Puedes validar el canje escribiendo el codigo.',
    permission_denied: 'No pudimos acceder a la camara. Revisa permisos o continua con el codigo manual.',
    validating: 'Validando el canje detectado...',
    error: 'Ocurrio un problema con el scanner. Puedes volver a intentar o usar el codigo manual.',
  }

  return <p className="text-xs leading-5 text-muted-foreground">{copy[state]}</p>
}

function BusinessQrScanner({
  open,
  scannerState,
  onStateChange,
  onCodeDetected,
}: {
  open: boolean
  scannerState: BusinessScannerState
  onStateChange: (next: BusinessScannerState) => void
  onCodeDetected: (code: string) => Promise<void>
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isHandlingRef = useRef(false)
  const sessionRef = useRef(0)
  const emitStateChange = useEffectEvent((next: BusinessScannerState) => {
    onStateChange(next)
  })
  const emitDetectedCode = useEffectEvent(async (code: string) => {
    await onCodeDetected(code)
  })

  useEffect(() => {
    if (!open) {
      stopScanner()
      emitStateChange('idle')
      return
    }

    if (streamRef.current) {
      return
    }

    const windowWithDetector = window as WindowWithBarcodeDetector
    if (!navigator.mediaDevices?.getUserMedia) {
      emitStateChange('unsupported')
      return
    }

    sessionRef.current += 1
    const currentSession = sessionRef.current
    const detector = windowWithDetector.BarcodeDetector ? new windowWithDetector.BarcodeDetector({ formats: ['qr_code'] }) : null

    async function start() {
      try {
        emitStateChange('starting')
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
          },
        })
        if (currentSession !== sessionRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        emitStateChange('scanning')
        scanLoop(detector)
      } catch (error) {
        if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
          emitStateChange('permission_denied')
          return
        }
        emitStateChange('error')
      }
    }

    async function scanLoop(detectorInstance: BarcodeDetectorLike | null) {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return

      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        emitStateChange('error')
        return
      }

      const step = async () => {
        if (!videoRef.current || !canvasRef.current || !streamRef.current) {
          return
        }

        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !isHandlingRef.current) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          context.drawImage(video, 0, 0, canvas.width, canvas.height)

          try {
            let detectedCode: string | null = null

            if (detectorInstance) {
              const results = await detectorInstance.detect(canvas)
              detectedCode = results.find((result) => typeof result.rawValue === 'string' && result.rawValue.trim().length > 0)?.rawValue?.trim() ?? null
            } else {
              const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
              const result = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              })
              detectedCode = result?.data?.trim() ?? null
            }

            if (detectedCode) {
              isHandlingRef.current = true
              emitStateChange('validating')
              stopScanner()
              await emitDetectedCode(detectedCode)
              return
            }
          } catch {
            emitStateChange('error')
            stopScanner()
            return
          }
        }

        animationFrameRef.current = window.requestAnimationFrame(step)
      }

      animationFrameRef.current = window.requestAnimationFrame(step)
    }

    void start()

    return () => {
      if (currentSession === sessionRef.current) {
        stopScanner()
        isHandlingRef.current = false
      }
    }

    function stopScanner() {
      sessionRef.current += 1
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      const video = videoRef.current
      if (video) {
        video.pause()
        video.srcObject = null
      }
    }
  }, [open])

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <div className="aspect-[4/3] w-full bg-[radial-gradient(circle_at_top,rgba(17, 34, 80,0.12),transparent_45%),linear-gradient(180deg,rgba(18,18,18,0.92),rgba(34,34,34,0.98))]">
          {scannerState === 'scanning' || scannerState === 'starting' || scannerState === 'validating' ? (
            <div className="relative h-full w-full">
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-40 w-40 rounded-[2rem] border border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                  <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-cyan-300/90 shadow-[0_0_14px_rgba(103,232,249,0.9)]" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <ScanLine className="h-10 w-10 text-primary/80" />
              <p className="text-sm font-semibold text-white">Scanner QR Countrify</p>
              <p className="max-w-xs text-xs leading-5 text-white/70">Si el navegador no soporta el escaneo o bloquea la cámara, sigue disponible la validación manual por código.</p>
            </div>
          )}
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <ScannerStatusCopy state={scannerState} />
    </div>
  )
}

function RedemptionHub({
  scannerState,
  validationCode,
  validatingCode,
  validationResult,
  onValidationCodeChange,
  onValidateRedemption,
  onStartScanner,
  onDetectedCode,
}: {
  scannerState: BusinessScannerState
  validationCode: string
  validatingCode: boolean
  validationResult: PromotionRedemptionValidationResult | null
  onValidationCodeChange: (value: string) => void
  onValidateRedemption: () => Promise<void>
  onStartScanner: (next: BusinessScannerState) => void
  onDetectedCode: (code: string) => Promise<void>
}) {
  const scannerOpen = scannerState !== 'idle'

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Validar canje</h3>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Escanea el QR del vecino o ingresa el código manualmente. Ambos caminos validan el mismo canje y respetan el uso único por promoción.
        </p>

        {!scannerOpen ? (
          <button
            onClick={() => onStartScanner('starting')}
            className="mt-5 glass-card glass-card-hover flex w-full items-center justify-center gap-3 rounded-2xl p-4 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Abrir escáner QR</p>
              <p className="text-xs text-muted-foreground">La cámara se activa al instante para validar el cupón del vecino.</p>
            </div>
          </button>
        ) : null}

        {scannerOpen ? (
          <div className="mt-5 space-y-4 rounded-3xl border border-border/60 bg-background/70 p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Escaner activo</p>
              <button onClick={() => onStartScanner('idle')} className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                Cerrar
              </button>
            </div>
            <div className="mx-auto max-w-xl">
              <BusinessQrScanner open={scannerOpen} scannerState={scannerState} onStateChange={onStartScanner} onCodeDetected={onDetectedCode} />
            </div>
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-border/60 bg-muted/20 p-4 space-y-3">
          <Label>Codigo de canje</Label>
          <p className="text-xs text-muted-foreground">Si no quieres usar la cámara o el navegador no la habilita, puedes validar el mismo cupón pegando el código manual.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={validationCode}
              onChange={(event) => onValidationCodeChange(event.target.value.toUpperCase())}
              placeholder="Ej: Countrify:AB12CD34EF56"
              className="sm:flex-1"
            />
            <Button onClick={() => void onValidateRedemption()} className="btn-premium sm:min-w-40" disabled={validatingCode}>
              {validatingCode ? 'Validando...' : 'Confirmar canje'}
            </Button>
          </div>
        </div>

        {validationResult ? <div className="mt-4"><ValidationResultCard result={validationResult} /></div> : null}
      </div>
    </div>
  )
}

function PromoSection({
  title,
  emptyTitle,
  emptyBody,
  promotions,
  onCreate,
  onEdit,
  onDelete,
}: {
  title: string
  emptyTitle: string
  emptyBody: string
  promotions: Promotion[]
  onCreate?: () => void
  onEdit: (promotion: Promotion) => void
  onDelete: (id: string) => void
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        {onCreate ? (
          <Button size="sm" onClick={onCreate} className="btn-premium gap-2">
            <Plus className="h-4 w-4" />
            Nueva
          </Button>
        ) : null}
      </div>

      {promotions.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {promotions.map((promotion) => (
            <div key={promotion.id} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <MonthBadge monthStart={promotion.publishedMonth} />
                {promotion.sourcePromotionId ? (
                  <span className="inline-flex rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    Repetida
                  </span>
                ) : null}
              </div>
              <PromotionCard promotion={promotion} showAnalytics onEdit={onEdit} onDelete={onDelete} />
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-8 text-center">
          <p className="font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{emptyBody}</p>
        </div>
      )}
    </section>
  )
}

function RedemptionHistorySection({
  title,
  subtitle,
  items,
}: {
  title: string
  subtitle?: string
  items: PromotionRedemptionHistoryItem[]
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>

      {items.length > 0 ? (
        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="divide-y divide-border/60">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{item.neighborName}</p>
                    {item.neighborUnitLabel ? (
                      <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {item.neighborUnitLabel}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Canjeo <span className="font-medium text-foreground">{item.promotionTitle}</span>
                    {item.promotionDiscount ? ` · ${item.promotionDiscount}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{new Date(item.redeemedAt).toLocaleString('es-AR')}</span>
                    {item.buildingName ? <span>{item.buildingName}</span> : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    {item.status === 'redeemed' ? 'Canjeado' : item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-8 text-center">
          <p className="font-medium text-foreground">Todavia no hay canjes registrados.</p>
          <p className="mt-1 text-sm text-muted-foreground">Cuando empieces a validar QRs, aqui vas a poder ver que vecino uso cada promocion.</p>
        </div>
      )}
    </section>
  )
}

function TourRelaunchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-tour="business-tour-relaunch"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <CircleHelp className="h-3.5 w-3.5" />
      Ver tour
    </button>
  )
}

export function BusinessDashboard({
  initialData,
  profileId,
}: {
  initialData: BusinessDashboardData
  profileId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const rawSection = searchParams.get('section')
  const urlSection: BusinessDashboardSection = isBusinessDashboardSection(rawSection) ? rawSection : 'home'
  const [business, setBusiness] = useState<Business | null>(initialData.business)
  const [promotions, setPromotions] = useState<Promotion[]>(initialData.promotions)
  const [activeSection, setActiveSection] = useState<BusinessDashboardSection>(urlSection)
  const [showModal, setShowModal] = useState(false)
  const [modalState, setModalState] = useState<PromotionFormState | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [deleteDialogPromotion, setDeleteDialogPromotion] = useState<Promotion | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [validationCode, setValidationCode] = useState('')
  const [validatingCode, setValidatingCode] = useState(false)
  const [validationResult, setValidationResult] = useState<PromotionRedemptionValidationResult | null>(null)
  const [scannerState, setScannerState] = useState<BusinessScannerState>('idle')
  const [redemptionHistory, setRedemptionHistory] = useState<PromotionRedemptionHistoryItem[]>(initialData.redemptionHistory)
  const [tourOpen, setTourOpen] = useState(false)
  const [tourStep, setTourStep] = useState(0)
  const [tourRect, setTourRect] = useState<DOMRect | null>(null)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [mapLocation, setMapLocation] = useState<[number, number] | null>(
    business?.latitude && business?.longitude ? [business.latitude, business.longitude] : null,
  )
  const [address, setAddress] = useState(business?.address ?? '')
  const [locationSaving, setLocationSaving] = useState(false)
  const [isLocationEditing, setIsLocationEditing] = useState(false)
  const tourSteps = useMemo(
    () => (isMobileViewport ? BUSINESS_TOUR_STEPS_MOBILE : BUSINESS_TOUR_STEPS_DESKTOP),
    [isMobileViewport],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const updateViewport = () => setIsMobileViewport(window.innerWidth < 768)
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const alreadySeen = window.localStorage.getItem(BUSINESS_TOUR_STORAGE_KEY) === 'seen'
    if (alreadySeen) return
    const timer = window.setTimeout(() => {
      setTourOpen(true)
      setTourStep(0)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!tourOpen) {
      setTourRect(null)
      return
    }

    const step = tourSteps[tourStep]
    if (!step) return

    const updateRect = () => {
      const element = document.querySelector(step.selector) as HTMLElement | null
      setTourRect(element ? element.getBoundingClientRect() : null)
    }

    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [tourOpen, tourStep, tourSteps])

  useEffect(() => {
    if (activeSection !== urlSection) {
      setActiveSection(urlSection)
    }
  }, [urlSection])

  function closeTour(markAsSeen = true) {
    setTourOpen(false)
    setTourRect(null)
    if (markAsSeen && typeof window !== 'undefined') {
      window.localStorage.setItem(BUSINESS_TOUR_STORAGE_KEY, 'seen')
    }
  }

  function goToNextTourStep() {
    if (tourStep >= tourSteps.length - 1) {
      closeTour(true)
      return
    }
    setTourStep((prev) => prev + 1)
  }

  useEffect(() => {
    if (activeSection !== urlSection) {
      return
    }

    const params = new URLSearchParams(searchParams.toString())
    if (activeSection === 'home') {
      params.delete('section')
    } else {
      params.set('section', activeSection)
    }

    const nextQuery = params.toString()
    const currentQuery = searchParams.toString()
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
    }
  }, [activeSection, pathname, router, searchParams])

  useEffect(() => {
    if (activeSection === 'scanner') {
      if (scannerState === 'idle' && !validationResult) {
        setScannerState('starting')
      }
      return
    }

    if (scannerState !== 'idle') {
      setScannerState('idle')
    }
  }, [activeSection, scannerState, validationResult])

  const referenceMonthStart = initialData.monthlyStatus?.monthStart ?? getCurrentMonthStart()
  const effectivePromotions = useMemo(() => applyPromotionAutoRenewal(promotions, referenceMonthStart), [promotions, referenceMonthStart])
  const monthlyStatus = useMemo(() => buildMonthlyStatus(promotions, referenceMonthStart), [promotions, referenceMonthStart])
  const totalUsage = useMemo(() => effectivePromotions.reduce((sum, promotion) => sum + promotion.usageCount, 0), [effectivePromotions])
  const thisMonthPromotions = useMemo(
    () => effectivePromotions.filter((promotion) => promotion.publishedMonth === monthlyStatus.monthStart),
    [effectivePromotions, monthlyStatus.monthStart],
  )
  const previousPromotions = useMemo(
    () => effectivePromotions.filter((promotion) => promotion.publishedMonth !== monthlyStatus.monthStart),
    [effectivePromotions, monthlyStatus.monthStart],
  )
  const activePromotionsCount = useMemo(
    () => effectivePromotions.filter((promotion) => promotion.isActive && promotion.expirationDate >= new Date().toISOString().slice(0, 10)).length,
    [effectivePromotions],
  )
  const thisMonthRedemptions = useMemo(
    () => redemptionHistory.filter((item) => item.redeemedAt.slice(0, 7) === monthlyStatus.monthStart.slice(0, 7)).length,
    [redemptionHistory, monthlyStatus.monthStart],
  )
  const recentRedemptions = useMemo(() => redemptionHistory.slice(0, 5), [redemptionHistory])

  function openScannerSection() {
    setValidationCode('')
    setValidationResult(null)
    setActiveSection('scanner')
    setScannerState('starting')
  }

  function goToSection(nextSection: BusinessDashboardSection) {
    if (nextSection === 'scanner') {
      openScannerSection()
      return
    }

    setActiveSection(nextSection)
    if (scannerState !== 'idle') {
      setScannerState('idle')
    }
  }

  function openCreateModal() {
    setModalMode('create')
    setModalState(emptyPromotionState(monthlyStatus.monthStart))
    setShowModal(true)
  }

  function openEditModal(promotion: Promotion) {
    setModalMode('edit')
    setModalState({
      id: promotion.id,
      title: promotion.title,
      description: promotion.description,
      discount: promotion.discount,
      category: promotion.category,
      expirationDate: promotion.expirationDate,
      buildingId: promotion.buildingId,
      publishedMonth: promotion.publishedMonth,
      sourcePromotionId: promotion.sourcePromotionId,
    })
    setShowModal(true)
  }

  async function handlePromotionSave(form: PromotionFormState, file: File | null) {
    if (!business) {
      toast.error('El negocio no esta asociado.')
      return
    }

    const recordId = form.id ?? createClientUuid()
    const currentPromotion = promotions.find((promotion) => promotion.id === form.id) ?? null
    let imagePath = currentPromotion?.imagePath ?? null
    let imageUrl = currentPromotion?.imageUrl ?? null

    if (file) {
      const uploadedImage = await uploadBusinessAsset({
        kind: 'promotion-image',
        businessId: business.id,
        recordId,
        file,
      })
      imagePath = uploadedImage.path
      imageUrl = uploadedImage.url
    }

    const payload = {
      id: recordId,
      business_id: business.id,
      title: form.title,
      description: form.description,
      discount: form.discount,
      category: form.category,
      expiration_date: form.expirationDate,
      building_id: form.buildingId,
      image_path: imagePath,
      is_active: true,
    }

    const response = await fetch(`/api/business/promotions?mode=${form.id ? 'update' : 'create'}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const result = await readJsonResponse<{ error?: string }>(response)

    if (!response.ok) {
      toast.error(result?.error ?? 'No se pudo guardar la promocion.')
      return
    }

    const nextPromotion: Promotion = {
      id: recordId,
      businessId: business.id,
      businessName: business.name,
      title: form.title,
      description: form.description,
      discount: form.discount,
      category: form.category,
      expirationDate: form.expirationDate,
      usageCount: currentPromotion?.usageCount ?? 0,
      buildingId: form.buildingId,
      createdAt: currentPromotion?.createdAt ?? new Date().toISOString(),
      publishedMonth: form.publishedMonth,
      sourcePromotionId: form.sourcePromotionId,
      imagePath,
      imageUrl,
      isActive: true,
    }

    setPromotions((prev) => (form.id ? prev.map((promotion) => (promotion.id === form.id ? nextPromotion : promotion)) : [nextPromotion, ...prev]))
    toast.success(form.id ? 'Promocion actualizada.' : 'Promocion creada.')
  }

  async function handleDelete(id: string) {
    const response = await fetch(`/api/business/promotions/${id}`, {
      method: 'DELETE',
    })
    const result = await readJsonResponse<{ error?: string }>(response)
    if (!response.ok) {
      toast.error(result?.error ?? 'No se pudo eliminar la promocion.')
      return
    }

    setPromotions((prev) => prev.filter((promotion) => promotion.id !== id))
    toast.success('Promocion eliminada.')
  }

  function requestDeletePromotion(id: string) {
    const promotion = promotions.find((item) => item.id === id) ?? null
    if (!promotion) {
      toast.error('No encontramos la promocion que quieres eliminar.')
      return
    }
    setDeleteDialogPromotion(promotion)
  }

  async function confirmDeletePromotion() {
    if (!deleteDialogPromotion) return
    await handleDelete(deleteDialogPromotion.id)
    setDeleteDialogPromotion(null)
  }

  async function handleLogoUpload() {
    if (!business || !logoFile) {
      toast.error('Selecciona una imagen antes de subirla.')
      return
    }

    setLogoUploading(true)
    try {
      const uploadedLogo = await uploadBusinessAsset({
        kind: 'business-logo',
        businessId: business.id,
        recordId: profileId,
        file: logoFile,
      })
      const logoPath = uploadedLogo.path
      const logoUrl = uploadedLogo.url
      const response = await fetch('/api/business/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: business.id,
          logoPath,
        }),
      })
      const result = await readJsonResponse<{ error?: string }>(response)
      if (!response.ok) throw new Error(result?.error ?? 'No se pudo guardar el logo.')
      setBusiness({ ...business, logoPath, logoUrl })
      toast.success('Logo actualizado.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir el logo.')
    } finally {
      setLogoUploading(false)
    }
  }

  async function handleLocationSave() {
    if (!business || !mapLocation) {
      toast.error('Selecciona una ubicacion en el mapa.')
      return
    }

    setLocationSaving(true)
    try {
      const response = await fetch('/api/business/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: business.id,
          address,
          latitude: mapLocation[0],
          longitude: mapLocation[1],
        }),
      })
      const result = await readJsonResponse<{ error?: string }>(response)
      if (!response.ok) throw new Error(result?.error ?? 'No se pudo guardar la ubicacion.')

      setBusiness({ ...business, address, latitude: mapLocation[0], longitude: mapLocation[1] })
      toast.success('Ubicacion actualizada.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la ubicacion.')
    } finally {
      setLocationSaving(false)
    }
  }

  async function runValidation(rawCode: string) {
    const code = rawCode.trim()
    if (!code) {
      toast.error('Ingresa el codigo del cupon.')
      return
    }

    setValidatingCode(true)
    const response = await fetch('/api/business/redemptions/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rawToken: code,
      }),
    })
    const payload = await readJsonResponse<{ error?: string; result?: PromotionRedemptionValidationResult }>(response)
    setValidatingCode(false)

    if (!response.ok || !payload?.result) {
      setScannerState('error')
      toast.error(payload?.error ?? 'No se pudo validar el codigo.')
      return
    }

    const nextResult = payload.result

    setValidationResult(nextResult)
    setValidationCode('')
    setScannerState('idle')

    if (nextResult.status === 'redeemed' && nextResult.promotionId) {
      setPromotions((current) =>
        current.map((promotion) =>
          promotion.id === nextResult.promotionId ? { ...promotion, usageCount: promotion.usageCount + 1 } : promotion,
        ),
      )
      setRedemptionHistory((current) => [
        {
          id: nextResult.tokenId ?? createClientUuid(),
          promotionId: nextResult.promotionId,
          promotionTitle: nextResult.promotionTitle ?? 'Promocion',
          promotionDiscount: promotions.find((promotion) => promotion.id === nextResult.promotionId)?.discount ?? null,
          profileId: '',
          neighborName: nextResult.neighborName ?? 'Vecino',
          neighborUnitLabel: null,
          buildingName: null,
          status: nextResult.status,
          redeemedAt: nextResult.redeemedAt ?? new Date().toISOString(),
          createdAt: nextResult.redeemedAt ?? new Date().toISOString(),
        },
        ...current,
      ])
      toast.success('Canje validado correctamente.')
      return
    }

    toast(nextResult.message)
  }

  if (!business) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="glass-card rounded-2xl p-8">
          <h2 className="mb-2 font-serif text-2xl font-bold text-foreground">Todavia no tienes un negocio asociado</h2>
          <p className="text-muted-foreground">
            El usuario esta autenticado, pero su perfil no tiene `business_id`. Asigna un negocio al perfil en la base principal para habilitar este panel.
          </p>
        </div>
      </div>
    )
  }

  const navItems: Array<{ key: BusinessDashboardSection; label: string; icon: typeof Home }> = [
    { key: 'home', label: 'Inicio', icon: Home },
    { key: 'promotions', label: 'Promos', icon: Gift },
    { key: 'scanner', label: 'Escanear', icon: Camera },
    { key: 'history', label: 'Historial', icon: History },
    { key: 'profile', label: 'Perfil', icon: CircleUserRound },
  ]

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--background)' }}>
      {activeSection === 'home' ? (
        <div className="relative overflow-hidden border-b border-border/60 bg-background px-5 pt-4 pb-4">
          <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-60" style={{ background: 'radial-gradient(circle, rgba(17,34,80,0.18), transparent 70%)' }} />

          <div className="relative z-10">
            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
              <h1 className="text-foreground text-xl font-semibold tracking-tight leading-tight">
                Hola, {business.name} <span aria-hidden>👋</span>
              </h1>
              {business.category && (
                <span className="inline-flex items-center gap-1 text-muted-foreground text-xs font-medium">
                  <Store className="w-3 h-3" />
                  {business.category}
                </span>
              )}
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              <span className="font-semibold text-primary">{activePromotionsCount} promos activas</span>
              {' · '}
              <span className={monthlyStatus.isCompliant ? 'font-semibold text-primary' : 'font-semibold text-amber-600'}>
                {monthlyStatus.isAutoRenewed
                  ? `${monthlyStatus.monthLabel} auto-renovada`
                  : monthlyStatus.isCompliant
                    ? `${monthlyStatus.monthLabel} al día`
                    : `${monthlyStatus.monthLabel} pendiente`}
              </span>
            </p>
            <div className="mt-3">
              <TourRelaunchButton
                onClick={() => {
                  setTourStep(0)
                  setTourOpen(true)
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-5xl px-4 pt-5">
        {activeSection !== 'home' ? (
          <div className="mb-4 flex justify-end">
            <TourRelaunchButton
              onClick={() => {
                setTourStep(0)
                setTourOpen(true)
              }}
            />
          </div>
        ) : null}
        {activeSection === 'home' ? (
          <div className="space-y-8">
            <section>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Canjes', value: totalUsage, icon: BarChart3 },
                  { label: 'Canjes mes', value: thisMonthRedemptions, icon: Store },
                  { label: 'Promos activas', value: activePromotionsCount, icon: Tag },
                ].map((stat) => (
                  <div key={stat.label} className="glass-card rounded-2xl p-4 text-center">
                    <stat.icon className="mx-auto mb-1 h-5 w-5 text-primary" />
                    <div className="text-xl font-bold text-foreground">{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="glass-card rounded-2xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Promocion mensual</p>
                    <h2 className="mt-2 font-serif text-2xl text-foreground">Estado de {monthlyStatus.monthLabel}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Tu negocio debe publicar al menos una promoción nueva por mes. Si este mes no cargaste una, Countrify mantiene activa automáticamente la última promo disponible para que el beneficio no se corte.
                    </p>
                  </div>
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                      monthlyStatus.isCompliant ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {monthlyStatus.isAutoRenewed ? 'Auto-renovada' : monthlyStatus.isCompliant ? 'Cumplido' : 'Pendiente'}
                  </div>
                </div>

                {monthlyStatus.isAutoRenewed && monthlyStatus.autoRenewedPromotion ? (
                  <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                    Este mes se reutilizó automáticamente <span className="font-semibold">{monthlyStatus.autoRenewedPromotion.title}</span> para que tu promo siga visible mientras cargas una nueva.
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button onClick={openCreateModal} className="btn-premium gap-2">
                    <Plus className="h-4 w-4" />
                    Crear promocion del mes
                  </Button>
                </div>

                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Si no cargas promociones nuevas, Countrify repetira automaticamente la ultima promocion activa para que no se corte el beneficio.
                </div>

                {monthlyStatus.lastMonthPromotion ? (
                  <div className="mt-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Base sugerida</p>
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{monthlyStatus.lastMonthPromotion.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{formatMonthLabel(monthlyStatus.lastMonthPromotion.publishedMonth)}</p>
                      </div>
                      <span className="rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                        {monthlyStatus.lastMonthPromotion.discount}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <PromoSection
              title={`Publicadas en ${monthlyStatus.monthLabel}`}
              emptyTitle="Todavia no publicaste una promocion este mes."
              emptyBody="Crea una nueva promocion para mantener actualizado tu contenido mensual en Countrify."
              promotions={thisMonthPromotions}
              onCreate={openCreateModal}
              onEdit={openEditModal}
              onDelete={requestDeletePromotion}
            />

            <RedemptionHistorySection
              title="Ultimos canjes"
              subtitle="Un vistazo rapido de que residentes ya usaron promociones de tu negocio."
              items={recentRedemptions}
            />
          </div>
        ) : null}

        {activeSection === 'promotions' ? (
          <div>
            <SectionHeader title="Promociones del negocio" onBack={() => goToSection('home')} />
            <div className="space-y-8">
              <PromoSection
                title={`Promos del mes · ${monthlyStatus.monthLabel}`}
                emptyTitle="Todavia no hay promociones en el mes actual."
                emptyBody="Publica una promo nueva para mantener tu negocio activo dentro de Countrify."
                promotions={thisMonthPromotions}
                onCreate={openCreateModal}
                onEdit={openEditModal}
                onDelete={requestDeletePromotion}
              />
            </div>
          </div>
        ) : null}

        {activeSection === 'scanner' ? (
          <div data-tour="business-scanner-section">
            <SectionHeader title="Escanear y validar canjes" onBack={() => goToSection('home')} />
            <div className="space-y-6">
              <RedemptionHub
                scannerState={scannerState}
                validationCode={validationCode}
                validatingCode={validatingCode}
                validationResult={validationResult}
                onValidationCodeChange={setValidationCode}
                onValidateRedemption={() => runValidation(validationCode)}
                onStartScanner={setScannerState}
                onDetectedCode={runValidation}
              />

              <RedemptionHistorySection
                title="Canjes más recientes"
                subtitle="Después de validar un QR, el movimiento aparece aquí para que tengas trazabilidad inmediata."
                items={recentRedemptions}
              />
            </div>
          </div>
        ) : null}

        {activeSection === 'history' ? (
          <div>
            <SectionHeader title="Historial del negocio" onBack={() => goToSection('home')} />
            <div className="space-y-8">
              <RedemptionHistorySection
                title="Canjes registrados"
                subtitle="Aqui ves que vecino canjeo cada promocion y cuando se valido."
                items={redemptionHistory}
              />
              <PromoSection
                title="Promociones anteriores"
                emptyTitle="Aun no hay historico para mostrar."
                emptyBody="Cuando cierres un mes con promociones publicadas, apareceran aqui para reutilizarlas despues."
                promotions={previousPromotions}
                onEdit={openEditModal}
                onDelete={requestDeletePromotion}
              />
            </div>
          </div>
        ) : null}

        {activeSection === 'profile' ? (
          <div>
            <SectionHeader title="Perfil del negocio" onBack={() => goToSection('home')} />
            <div className="space-y-6">
              <div className="glass-card rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Identidad comercial</p>
                    <h2 className="font-serif text-3xl font-bold text-foreground">{business.name}</h2>
                    <p className="mt-2 text-muted-foreground">{business.description}</p>
                    <div className="mt-3 inline-flex rounded-full bg-secondary/80 px-3 py-1 text-xs font-medium text-secondary-foreground">
                      {business.category}
                    </div>
                  </div>

                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-background">
                    {business.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={business.logoUrl} alt={business.name} className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="h-10 w-10 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-2xl p-6">
                <div className="mb-4 flex items-center gap-2">
                  <ImagePlus className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-foreground">Logo y presencia visual</h3>
                </div>
                <ImageUploadField
                  label={IMAGE_RULES.businessLogo.label}
                  helpText={IMAGE_RULES.businessLogo.recommended}
                  maxSizeMb={IMAGE_RULES.businessLogo.maxSizeMb}
                  minWidth={IMAGE_RULES.businessLogo.minWidth}
                  minHeight={IMAGE_RULES.businessLogo.minHeight}
                  valueUrl={business.logoUrl}
                  onFileChange={setLogoFile}
                />
                <Button onClick={handleLogoUpload} className="mt-4 w-full btn-premium gap-2" disabled={logoUploading}>
                  <Upload className="h-4 w-4" />
                  {logoUploading ? 'Subiendo logo...' : 'Actualizar logo'}
                </Button>
              </div>

              <div className="glass-card rounded-2xl p-6 overflow-hidden relative">
                <div className="mb-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Ubicacion protegida</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Para evitar cambios accidentales, primero activa el modo de edicion.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={isLocationEditing ? 'outline' : 'default'}
                      className={isLocationEditing ? '' : 'btn-premium'}
                      onClick={() => setIsLocationEditing((prev) => !prev)}
                    >
                      {isLocationEditing ? 'Cancelar edicion' : 'Editar ubicacion'}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-6 lg:flex-row">
                  <div className="flex-1">
                    <h3 className="font-serif text-xl font-bold text-foreground mb-2 flex items-center gap-2">
                      <Store className="w-5 h-5 text-primary" />
                      Ubicacion del negocio
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Ajusta la direccion y el punto en el mapa para que los residentes encuentren tu local con mas facilidad.
                    </p>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Direccion</Label>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            value={address}
                            onChange={(event) => setAddress(event.target.value)}
                            placeholder="Ej. Av. Sarmiento 2555"
                            disabled={!isLocationEditing}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!isLocationEditing}
                            onClick={async () => {
                              if (!address.trim()) return
                              toast.loading('Buscando direccion...', { id: 'geoco' })
                              try {
                                const q = encodeURIComponent(`${address}, San Miguel de Tucuman, Argentina`)
                                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`)
                                const data = await res.json()
                                if (data && data.length > 0) {
                                  setMapLocation([parseFloat(data[0].lat), parseFloat(data[0].lon)])
                                  toast.success('Ubicacion aproximada encontrada.', { id: 'geoco' })
                                } else {
                                  toast.error('No pudimos ubicarla. Puedes marcar el punto manualmente en el mapa.', { id: 'geoco' })
                                }
                              } catch {
                                toast.error('Error buscando la direccion.', { id: 'geoco' })
                              }
                            }}
                          >
                            Ubicar
                          </Button>
                        </div>
                      </div>

                      <Button
                        onClick={async () => {
                          await handleLocationSave()
                          setIsLocationEditing(false)
                        }}
                        className="w-full btn-premium"
                        disabled={!isLocationEditing || locationSaving || !mapLocation}
                      >
                        {locationSaving ? 'Guardando ubicacion...' : 'Guardar ubicacion y direccion'}
                      </Button>
                    </div>
                  </div>

                  <div className="flex-[1.35] overflow-hidden rounded-2xl border border-border/60 bg-background">
                    <div className="h-[320px]">
                      <DynamicMap
                        center={mapLocation ?? [-26.8306, -65.2038]}
                        zoom={mapLocation ? 16 : 13}
                        interactive={isLocationEditing}
                        selectedLocation={mapLocation}
                        onLocationSelect={(lat, lng) => {
                          if (!isLocationEditing) return
                          setMapLocation([lat, lng])
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <nav className="pointer-events-none fixed inset-x-0 bottom-3 z-40 px-3">
        <div className="pointer-events-auto mx-auto flex w-full max-w-md items-end justify-around gap-1 rounded-[1.75rem] border border-border/60 bg-background/92 px-2 py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.16)] backdrop-blur-xl sm:max-w-lg sm:px-3">
          {navItems.map((item) => {
            const isActive = activeSection === item.key
            const isScanner = item.key === 'scanner'
            return (
              <button
                key={item.key}
                data-tour={`business-nav-${item.key}`}
                onClick={() => goToSection(item.key)}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-2 transition-all ${isScanner ? 'pb-0 pt-0' : 'py-1'}`}
              >
                <div
                  className={`flex items-center justify-center rounded-2xl transition-all ${
                    isScanner
                      ? `h-14 w-14 -translate-y-7 border shadow-lg ${isActive ? 'bg-primary text-primary-foreground border-primary/40' : 'bg-background text-primary border-primary/25'}`
                      : ''
                  }`}
                  style={
                    isScanner && isActive
                      ? { background: 'linear-gradient(135deg, #112250, #0a1838)' }
                      : undefined
                  }
                >
                  <item.icon className={`${isScanner ? 'h-6 w-6' : 'h-5 w-5'}`} style={!isScanner ? { color: isActive ? 'var(--primary)' : 'var(--muted-foreground)' } : undefined} />
                </div>
                <span className={`text-[10px] font-medium ${isScanner ? '-mt-3' : ''}`} style={{ color: isScanner ? (isActive ? 'var(--primary)' : 'var(--muted-foreground)') : (isActive ? 'var(--primary)' : 'var(--muted-foreground)') }}>{item.label}</span>
                {item.key === 'home' && !monthlyStatus.isCompliant ? (
                  <span className="absolute right-0 top-0 h-2.5 w-2.5 -translate-y-1/4 translate-x-1/4 rounded-full bg-amber-500" />
                ) : null}
              </button>
            )
          })}
        </div>
      </nav>

      {showModal && modalState ? (
        <PromotionModal
          buildings={initialData.availableBuildings}
          initial={modalState}
          mode={modalMode}
          monthLabel={monthlyStatus.monthLabel}
          onClose={() => setShowModal(false)}
          onSave={handlePromotionSave}
        />
      ) : null}

      <AlertDialog open={Boolean(deleteDialogPromotion)} onOpenChange={(open) => (!open ? setDeleteDialogPromotion(null) : undefined)}>
        <AlertDialogContent className="border-border/60 bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar promocion</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialogPromotion
                ? `Esta accion elimina "${deleteDialogPromotion.title}" y no se puede deshacer.`
                : 'Esta accion no se puede deshacer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void confirmDeletePromotion()}>
              Si, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {tourOpen ? (
        <div className="fixed inset-0 z-[90]">
          <div className="absolute inset-0 bg-black/60" />
          {tourRect ? (
            <div
              className="pointer-events-none absolute rounded-2xl border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
              style={{
                top: `${Math.max(tourRect.top - 6, 0)}px`,
                left: `${Math.max(tourRect.left - 6, 0)}px`,
                width: `${tourRect.width + 12}px`,
                height: `${tourRect.height + 12}px`,
              }}
            />
          ) : null}

          <div className="absolute inset-x-4 bottom-24 mx-auto w-full max-w-sm rounded-2xl border border-border/60 bg-background p-4 shadow-2xl sm:bottom-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Tour del negocio · Paso {tourStep + 1}/{tourSteps.length}
            </p>
            <h3 className="mt-2 text-base font-semibold text-foreground">{tourSteps[tourStep]?.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{tourSteps[tourStep]?.description}</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => closeTour(true)}>
                Omitir
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setTourStep((prev) => Math.max(prev - 1, 0))} disabled={tourStep === 0}>
                  Anterior
                </Button>
                <Button size="sm" className="btn-premium" onClick={goToNextTourStep}>
                  {tourStep === tourSteps.length - 1 ? 'Finalizar' : 'Siguiente'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ChatWidget />
    </div>
  )
}
