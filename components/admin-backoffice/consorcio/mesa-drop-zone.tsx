'use client'

import { useEffect, useState } from 'react'
import { FileUp } from 'lucide-react'

type Props = {
  onFile: (file: File) => void
  disabled?: boolean
}

/**
 * Overlay global que detecta cuando el user está arrastrando un archivo sobre
 * la ventana y ofrece un drop target para extraer la factura con IA.
 * 100% fixed overlay, no interfiere con el DOM normal cuando no hay drag.
 */
export function MesaDropZone({ onFile, disabled = false }: Props) {
  const [active, setActive] = useState(false)
  const [highlight, setHighlight] = useState(false)

  useEffect(() => {
    if (disabled) return

    // Contador porque dragenter/leave pueden dispararse al cruzar hijos
    let counter = 0

    function isFileDrag(e: DragEvent): boolean {
      if (!e.dataTransfer) return false
      return Array.from(e.dataTransfer.types).includes('Files')
    }

    function onDragEnter(e: DragEvent) {
      if (!isFileDrag(e)) return
      counter += 1
      setActive(true)
    }

    function onDragLeave(e: DragEvent) {
      if (!isFileDrag(e)) return
      counter -= 1
      if (counter <= 0) {
        counter = 0
        setActive(false)
        setHighlight(false)
      }
    }

    function onDragOver(e: DragEvent) {
      if (!isFileDrag(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    function onDrop(e: DragEvent) {
      if (!isFileDrag(e)) return
      e.preventDefault()
      counter = 0
      setActive(false)
      setHighlight(false)
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      const isValid = file.type.startsWith('image/') || file.type === 'application/pdf'
      if (!isValid) return
      onFile(file)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [onFile, disabled])

  if (!active) return null

  return (
    <div
      className="fixed inset-0 z-[60] bg-background/85 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto"
      onDragEnter={() => setHighlight(true)}
      onDragLeave={() => setHighlight(false)}
      aria-hidden
    >
      <div
        className={`w-full max-w-lg rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-3 text-center transition-all ${
          highlight
            ? 'border-primary bg-primary/10 scale-[1.02] shadow-[0_0_60px_rgba(17, 34, 80,0.15)]'
            : 'border-primary/40 bg-background/90'
        }`}
      >
        <div className="w-14 h-14 rounded-2xl kpi-icon-disc flex items-center justify-center">
          <FileUp className="w-6 h-6" />
        </div>
        <h3 className="font-serif text-xl font-semibold text-foreground">
          Soltá la factura acá
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          La IA va a extraer proveedor, monto y fecha. Después confirmás y se imputa al mes.
        </p>
        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.12em]">
          PDF o imagen
        </p>
      </div>
    </div>
  )
}
