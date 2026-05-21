'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  requireCurrent: boolean
  successRedirect?: string
}

export function ChangePasswordForm({ requireCurrent, successRedirect }: Props) {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (requireCurrent && !currentPassword) {
      setError('Ingresá tu contraseña actual.')
      return
    }
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (newPassword !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (requireCurrent && currentPassword === newPassword) {
      setError('La nueva contraseña tiene que ser distinta de la actual.')
      return
    }

    setStatus('submitting')
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: requireCurrent ? currentPassword : undefined,
          newPassword,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        setError(payload?.error ?? 'No pudimos actualizar la contraseña.')
        setStatus('idle')
        return
      }
      setStatus('success')
      if (successRedirect) {
        setTimeout(() => {
          router.push(successRedirect)
          router.refresh()
        }, 1200)
      }
    } catch {
      setError('Error de red. Probá de nuevo.')
      setStatus('idle')
    }
  }

  if (status === 'success') {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <p className="text-sm text-muted-foreground">
          Listo. {successRedirect ? 'Redirigiendo…' : 'Tu contraseña fue actualizada.'}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
      {requireCurrent ? (
        <div className="space-y-2">
          <Label htmlFor="current-password">Contraseña actual</Label>
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="bg-input/50 border-border/50"
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="new-password">Nueva contraseña</Label>
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
          autoComplete="new-password"
          className="bg-input/50 border-border/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirmar nueva contraseña</Label>
        <Input
          id="confirm-password"
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
        Guardar contraseña
      </Button>
    </form>
  )
}
