'use client'

import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileText, Image as ImageIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getExpenseDocumentSignedUrl } from '@/app/iadmin/gastos/actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string | null
  fileName: string | null
  providerName?: string | null
  amount?: number | null
  issuedAt?: string | null
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
}

function isImageName(name: string | null): boolean {
  if (!name) return false
  return /\.(png|jpe?g|webp|gif|avif|heic)$/i.test(name)
}

function isPdfName(name: string | null): boolean {
  if (!name) return false
  return /\.pdf$/i.test(name)
}

export function ExpensePreviewDialog({
  open,
  onOpenChange,
  documentId,
  fileName,
  providerName,
  amount,
  issuedAt,
}: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !documentId) {
      setSignedUrl(null)
      return
    }
    let alive = true
    setLoading(true)
    getExpenseDocumentSignedUrl({ documentId })
      .then((r) => {
        if (alive) setSignedUrl(r.url)
      })
      .catch((err) => {
        if (!alive) return
        toast.error(err instanceof Error ? err.message : 'No se pudo cargar el comprobante')
        onOpenChange(false)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, documentId, onOpenChange])

  const isImage = isImageName(fileName)
  const isPdf = isPdfName(fileName)
  const canInline = isImage || isPdf

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/30">
          <DialogTitle className="font-serif text-lg flex items-center gap-2">
            {isImage ? <ImageIcon className="w-4 h-4 text-primary" /> : <FileText className="w-4 h-4 text-primary" />}
            <span className="truncate">{fileName ?? 'Comprobante'}</span>
          </DialogTitle>
          <DialogDescription className="text-xs flex items-center gap-2 flex-wrap">
            {providerName ? <span className="font-medium text-foreground">{providerName}</span> : null}
            {typeof amount === 'number' && amount > 0 ? (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="tabular-nums font-medium text-foreground">$ {formatARS(amount)}</span>
              </>
            ) : null}
            {issuedAt ? (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>emitida {issuedAt}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden bg-muted/30">
          {loading ? (
            <div className="flex items-center justify-center h-80 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Cargando comprobante…
            </div>
          ) : !signedUrl ? (
            <div className="flex items-center justify-center h-80 text-muted-foreground text-sm">
              Sin comprobante
            </div>
          ) : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signedUrl}
              alt={fileName ?? 'Comprobante'}
              className="w-full h-full max-h-[70vh] object-contain bg-[repeating-conic-gradient(#fafafa_0%,#fafafa_25%,#f0f0f0_25%,#f0f0f0_50%)] bg-[length:16px_16px]"
            />
          ) : isPdf ? (
            <iframe
              src={signedUrl}
              className="w-full h-[70vh] bg-background"
              title={fileName ?? 'Comprobante'}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-80 gap-3 text-sm text-muted-foreground">
              <FileText className="w-10 h-10 text-muted-foreground/50" />
              <p>Este tipo de archivo no se puede previsualizar.</p>
              <Button size="sm" variant="outline" asChild>
                <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Descargar
                </a>
              </Button>
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-border/30 flex items-center justify-between gap-2 bg-muted/10">
          <p className="text-[10px] text-muted-foreground italic">
            URL firmada válida por 5 minutos.
          </p>
          {signedUrl && canInline ? (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Abrir en pestaña nueva
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : null}
        </footer>
      </DialogContent>
    </Dialog>
  )
}
