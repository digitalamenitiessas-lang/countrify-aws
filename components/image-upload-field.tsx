'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ImagePlus, Info } from 'lucide-react'

interface ImageUploadFieldProps {
  label: string
  helpText: string
  maxSizeMb: number
  minWidth: number
  minHeight: number
  valueUrl?: string | null
  onFileChange: (file: File | null) => void
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function ImageUploadField({
  label,
  helpText,
  maxSizeMb,
  minWidth,
  minHeight,
  valueUrl,
  onFileChange,
}: ImageUploadFieldProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(valueUrl ?? null)
  const [warning, setWarning] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    setPreviewUrl(valueUrl ?? null)
  }, [valueUrl])

  async function handleChange(file: File | null) {
    setWarning(null)
    setSuccess(null)

    if (!file) {
      setPreviewUrl(valueUrl ?? null)
      onFileChange(null)
      return
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setWarning('Formato no soportado. Usa JPG, PNG o WEBP.')
      onFileChange(null)
      return
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      setWarning(`La imagen supera el maximo de ${maxSizeMb} MB.`)
      onFileChange(null)
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.width, height: image.height })
      image.onerror = () => reject(new Error('No se pudo leer la imagen'))
      image.src = objectUrl
    })

    setPreviewUrl(objectUrl)
    onFileChange(file)

    if (dimensions.width < minWidth || dimensions.height < minHeight) {
      setWarning(`La imagen es usable, pero se recomienda al menos ${minWidth}x${minHeight}px.`)
      return
    }

    setSuccess(`Archivo listo: ${dimensions.width}x${dimensions.height}px.`)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium text-foreground">{label}</label>
        <p className="text-xs text-muted-foreground mt-1">{helpText}</p>
      </div>

      <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/20 p-4">
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="w-full md:w-40 aspect-[4/3] rounded-xl border border-border/60 bg-background overflow-hidden flex items-center justify-center">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
            ) : (
              <div className="text-center text-muted-foreground">
                <ImagePlus className="w-8 h-8 mx-auto mb-2" />
                <span className="text-xs">Vista previa</span>
              </div>
            )}
          </div>

          <div className="flex-1 w-full space-y-3">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => handleChange(event.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
            />

            <div className="text-xs text-muted-foreground space-y-1">
              <p>Formatos recomendados: JPG, PNG o WEBP.</p>
              <p>Tamano maximo: {maxSizeMb} MB.</p>
              <p>Resolucion sugerida: minimo {minWidth}x{minHeight}px.</p>
            </div>

            {warning ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{warning}</span>
              </div>
            ) : null}

            {success ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{success}</span>
              </div>
            ) : null}

            {!warning && !success ? (
              <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Si la imagen no es ideal, te avisamos, pero no bloqueamos la carga mientras siga siendo valida.</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

