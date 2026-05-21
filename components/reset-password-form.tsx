'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  token: string
}

export function ResetPasswordForm({ token }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<'checking' | 'invalid' | 'ready' | 'submitting' | 'success'>(
    'checking',
  )
  const [fullName, setFullName] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return
        if (data?.valid) {
          setFullName(data.fullName ?? null)
          setStatus('ready')
        } else {
          setStatus('invalid')
        }
      })
      .catch(() => {
        if (active) setStatus('invalid')
      })
    return () => {
      active = false
    }
  }, [token])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setStatus('submitting')
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      setError(payload?.error ?? 'No pudimos actualizar la contraseña.')
      setStatus('ready')
      return
    }
    setStatus('success')
    setTimeout(() => router.push('/login'), 2000)
  }

  if (status === 'checking') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Validando link…
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-3 text-sm text-destructive">
          El link ya expiró o no es válido. Pedí uno nuevo desde la pantalla de ingreso.
        </div>
        <Link href="/login" className="block">
          <Button variant="outline" className="w-full">
            Volver a ingresar
          </Button>
        </Link>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <p className="text-sm text-muted-foreground">
          Listo. Redirigiendo a la pantalla de ingreso…
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
      {fullName ? (
        <div className="text-sm text-muted-foreground">
          Estás restableciendo la contraseña de <strong className="text-foreground">{fullName}</strong>.
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="new-password">Nueva contraseña</Label>
        <Input
          id="new-password"
          name="countrify-new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
          autoComplete="new-password"
          className="bg-input/50 border-border/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirmar contraseña</Label>
        <Input
          id="confirm-password"
          name="countrify-confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
          autoComplete="new-password"
          className="bg-input/50 border-border/50"
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Button
        type="submit"
        className="w-full btn-premium gap-2"
        disabled={status === 'submitting'}
      >
        {status === 'submitting' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        Guardar nueva contraseña
      </Button>
    </form>
  )
}
