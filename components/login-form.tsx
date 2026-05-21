'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, LogIn, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ROLE_HOME } from '@/lib/constants'
import type { UserRole } from '@/lib/types'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    setLoading(true)
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    const payload = await response.json().catch(() => null)
    setLoading(false)

    if (!response.ok || !payload?.profile?.role) {
      setError(payload?.error ?? 'No se pudo iniciar sesion.')
      return
    }

    if (payload.profile.passwordMustChange) {
      router.push('/cambiar-password?first=1')
    } else {
      router.push(ROLE_HOME[payload.profile.role as UserRole])
    }
    router.refresh()
  }

  async function handleForgotSubmit() {
    if (!forgotEmail.trim()) {
      setForgotError('Ingresá un email.')
      return
    }
    setForgotError(null)
    setForgotLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        setForgotError(payload?.error ?? 'No pudimos procesar la solicitud. Probá de nuevo.')
        return
      }
      setForgotSent(true)
    } catch {
      setForgotError('No pudimos procesar la solicitud. Probá de nuevo.')
    } finally {
      setForgotLoading(false)
    }
  }

  function openForgot() {
    setForgotEmail(email)
    setForgotSent(false)
    setForgotError(null)
    setForgotOpen(true)
  }

  function closeForgot() {
    if (forgotLoading) return
    setForgotOpen(false)
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="countrify-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@email.com"
            required
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="bg-input/50 border-border/50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="countrify-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
            autoComplete="new-password"
            className="bg-input/50 border-border/50"
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Button type="submit" className="w-full btn-premium gap-2" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          Ingresar
        </Button>

        <button
          type="button"
          onClick={openForgot}
          className="block w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Olvidé mi contraseña
        </button>
      </form>

      {forgotOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeForgot}
        >
          <div
            className="glass-card w-full max-w-sm rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {forgotSent ? (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                <div>
                  <h3 className="font-semibold text-foreground">Revisá tu mail</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Si el email está registrado, te enviamos un link para crear una nueva contraseña.
                    Expira en 24 horas.
                  </p>
                </div>
                <Button variant="outline" onClick={closeForgot} className="w-full">
                  Cerrar
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-foreground">Restablecer contraseña</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ingresá tu email y te mandamos un link para crear una nueva contraseña.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !forgotLoading) handleForgotSubmit()
                    }}
                    placeholder="tu@email.com"
                    required
                    autoFocus
                    className="bg-input/50 border-border/50"
                  />
                </div>
                {forgotError ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {forgotError}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeForgot}
                    className="flex-1"
                    disabled={forgotLoading}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={handleForgotSubmit}
                    className="flex-1 gap-2"
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    Enviar link
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
