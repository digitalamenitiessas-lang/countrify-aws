'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { updateEmailPreferencesAction, type EmailPreferences } from '@/app/configuracion/actions'

interface Props {
  initial: EmailPreferences
  visibleKeys?: Array<keyof EmailPreferences>
}

const ITEMS: Array<{
  key: keyof EmailPreferences
  label: string
  description: string
}> = [
  {
    key: 'complaints',
    label: 'Expedientes',
    description: 'Nuevos mensajes, cambios de estado y menciones en expedientes de tu country.',
  },
  {
    key: 'liquidations',
    label: 'Liquidaciones',
    description: 'Cuando se emite o cierra una liquidación de expensas en tu country.',
  },
  {
    key: 'announcements',
    label: 'Comunicados',
    description: 'Anuncios del country dirigidos a vecinos.',
  },
  {
    key: 'promotions',
    label: 'Promociones',
    description: 'Nuevas promociones de comercios afiliados. Desactivado por defecto.',
  },
]

export function EmailPreferencesForm({ initial, visibleKeys }: Props) {
  const [values, setValues] = useState<EmailPreferences>(initial)
  const [pending, startTransition] = useTransition()

  const items = visibleKeys
    ? ITEMS.filter((item) => visibleKeys.includes(item.key))
    : ITEMS

  function toggle(key: keyof EmailPreferences) {
    setValues((current) => ({ ...current, [key]: !current[key] }))
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await updateEmailPreferencesAction(values)
        toast.success('Preferencias actualizadas.')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No pudimos guardar las preferencias.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-start justify-between gap-4 rounded-xl border border-border/60 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <Label className="text-sm font-semibold text-foreground">{item.label}</Label>
              <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
            </div>
            <Switch
              checked={values[item.key]}
              onCheckedChange={() => toggle(item.key)}
              aria-label={item.label}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={pending} className="gap-2">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}
