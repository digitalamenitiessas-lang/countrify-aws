'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log al server logs (CloudWatch). Cuando integremos Sentry, va aca.
    console.error('[app/error]', { message: error.message, digest: error.digest, stack: error.stack })
  }, [error])

  return (
    <div className="min-h-screen bg-background pt-20 pb-16 flex items-center justify-center px-6">
      <div className="glass-card rounded-2xl p-8 w-full max-w-md text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
        </div>
        <h1 className="font-serif text-xl font-bold text-foreground">
          Algo no salió como esperábamos
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tuvimos un problema cargando esta página. Probá refrescar; si vuelve a pasar, escribinos
          a <a href="mailto:digitalamenitiessas@gmail.com" className="underline">digitalamenitiessas@gmail.com</a>.
        </p>
        {error.digest ? (
          <p className="mt-3 text-[11px] text-muted-foreground/70 font-mono">
            ref: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 rounded-lg btn-premium px-4 py-2 text-sm font-medium text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium hover:bg-muted/50"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
