'use client'

import { useRef, useState, useTransition } from 'react'
import { UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { attachExpenseDocument } from '@/app/iadmin/gastos/actions'
import { createClientUuid } from '@/lib/utils'

const MAX_MB = 15

type Props = {
  expenseId: string
  disabled?: boolean
}

function randomId() {
  return createClientUuid()
}

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120)
}

export function ExpenseDocumentUploader({ expenseId, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()

  async function onFileChosen(file: File) {
    if (file.size === 0) {
      toast.error('El archivo esta vacio')
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`El archivo supera ${MAX_MB}MB`)
      return
    }

    setUploading(true)
    try {
      const response = await fetch('/api/uploads/expense-document-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expenseId,
          fileName: sanitizeFileName(file.name) || `${randomId()}.bin`,
          contentType: file.type || 'application/octet-stream',
        }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.uploadUrl || !payload?.objectKey) {
        throw new Error(payload?.error ?? 'No se pudo preparar la carga del comprobante')
      }

      const uploadResponse = await fetch(payload.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error('No se pudo subir el comprobante a S3')
      }

      startTransition(async () => {
        try {
          await attachExpenseDocument({
            expenseId,
            storagePath: payload.objectKey,
            fileName: file.name,
            mimeType: file.type || null,
            sizeBytes: file.size,
          })
          toast.success('Documento cargado. Extraccion IA pendiente de validacion.')
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'No se pudo registrar el documento')
        }
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Fallo la subida')
    } finally {
      setUploading(false)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  const busy = uploading || pending

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/*"
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            void onFileChosen(file)
          }
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
        {busy ? 'Subiendo…' : 'Subir comprobante'}
      </Button>
    </div>
  )
}
