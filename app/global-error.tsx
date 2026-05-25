'use client'

import { useEffect } from 'react'

// Fallback ULTIMO: solo se renderiza cuando el root layout falla (ej.
// error en providers o en CSS critico). Debe definir su propio <html> y
// <body> porque reemplaza el layout root. No usar componentes ni clases
// del design system porque el contexto puede estar roto.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/global-error]', { message: error.message, digest: error.digest })
  }, [error])

  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', background: '#FAFAFA', color: '#1A1A1A' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 480, background: '#FFFFFF', border: '1px solid #E5E5E5', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#112250', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Error crítico
            </div>
            <h1 style={{ margin: '8px 0 12px', fontSize: 22, fontWeight: 700 }}>
              No pudimos cargar la aplicación
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
              Algo falló muy temprano en la carga. Refrescá la página. Si persiste, escribinos a{' '}
              <a href="mailto:digitalamenitiessas@gmail.com" style={{ color: '#112250' }}>
                digitalamenitiessas@gmail.com
              </a>
              .
            </p>
            {error.digest ? (
              <p style={{ marginTop: 12, fontSize: 11, color: '#999', fontFamily: 'monospace' }}>
                ref: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => reset()}
              style={{
                marginTop: 24,
                background: '#112250',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 10,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
