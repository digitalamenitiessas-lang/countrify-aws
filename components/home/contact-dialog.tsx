'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export type ContactKind = 'country' | 'business'

interface ContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: ContactKind
}

const COPY: Record<ContactKind, { title: string; description: string; orgLabel: string; orgPlaceholder: string; messagePlaceholder: string }> = {
  country: {
    title: 'Sumá tu country a Countrify',
    description: 'Contanos sobre tu barrio y te respondemos a la brevedad.',
    orgLabel: 'Nombre del country',
    orgPlaceholder: 'Ej: Los Alisos, Pilar',
    messagePlaceholder: 'Contanos cantidad de unidades, ubicación, y cualquier detalle que sirva.',
  },
  business: {
    title: 'Adherí tu negocio a Countrify',
    description: 'Llegá a residentes de countries y barrios cerrados.',
    orgLabel: 'Nombre del negocio',
    orgPlaceholder: 'Ej: La Vieja Escuela Café',
    messagePlaceholder: 'Contanos rubro, ubicación, web/Instagram y qué beneficios podrías ofrecer.',
  },
}

export function ContactDialog({ open, onOpenChange, kind }: ContactDialogProps) {
  const copy = COPY[kind]
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [organization, setOrganization] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setName('')
    setEmail('')
    setPhone('')
    setOrganization('')
    setMessage('')
    setError(null)
    setSuccess(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind, name, email, phone, organization, message }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(json.error ?? 'No pudimos enviar tu mensaje.')
          return
        }
        setSuccess(true)
      } catch {
        setError('Error de red. Probá de nuevo.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#112250]">{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#112250]/10 text-2xl">
              ✓
            </div>
            <div>
              <p className="font-medium text-[#112250]">¡Mensaje enviado!</p>
              <p className="mt-1 text-sm text-[#3b507d]">Te contactamos a la brevedad.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="border-[#112250] text-[#112250]"
            >
              Cerrar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="contact-name">Nombre y apellido</Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
                placeholder="Tu nombre"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={200}
                  placeholder="tu@email.com"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="contact-phone">Teléfono (opcional)</Label>
                <Input
                  id="contact-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={60}
                  placeholder="+54 11 ..."
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="contact-org">{copy.orgLabel}</Label>
              <Input
                id="contact-org"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                maxLength={200}
                placeholder={copy.orgPlaceholder}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="contact-message">Mensaje</Label>
              <Textarea
                id="contact-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                minLength={10}
                maxLength={4000}
                rows={4}
                placeholder={copy.messagePlaceholder}
              />
            </div>

            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-[#112250] text-white hover:bg-[#3b507d]"
              >
                {isPending ? 'Enviando...' : 'Enviar mensaje'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
