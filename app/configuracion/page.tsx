import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { EmailPreferencesForm } from '@/components/email-preferences-form'
import { ChangePasswordForm } from '@/components/change-password-form'
import { requireProfile } from '@/lib/auth'
import { findBusinessProfileById, findProfileById } from '@/lib/db/profiles'
import { getEmailPreferencesAction, type EmailPreferences } from '@/app/configuracion/actions'
import type { UserRole } from '@/lib/types'

const VISIBLE_KEYS_BY_ROLE: Record<UserRole, Array<keyof EmailPreferences>> = {
  super_admin: ['complaints', 'liquidations', 'announcements', 'promotions'],
  vecino: ['complaints', 'liquidations', 'announcements', 'promotions'],
  propietario: ['complaints', 'liquidations', 'announcements', 'promotions'],
  consorcio_admin: ['complaints', 'liquidations'],
  negocio_admin: [],
}

export default async function ConfiguracionPage() {
  const { profile } = await requireProfile(undefined, { allowMustChange: true })
  const fullProfile =
    profile.role === 'negocio_admin'
      ? await findBusinessProfileById(profile.id)
      : await findProfileById(profile.id)
  const preferences = await getEmailPreferencesAction()
  const mustChange = fullProfile?.passwordMustChange ?? false
  const visibleNotificationKeys = VISIBLE_KEYS_BY_ROLE[profile.role] ?? []

  return (
    <div className="min-h-screen bg-background pt-20 pb-16">
      <div className="mx-auto max-w-2xl px-6">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-foreground">Configuración</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hola {profile.fullName}.{' '}
            {visibleNotificationKeys.length > 0
              ? 'Acá podés ajustar cómo te avisamos y manejar tu contraseña.'
              : 'Acá podés manejar tu contraseña.'}
          </p>
        </div>

        {mustChange ? (
          <div className="mb-6 rounded-xl border border-amber-300/40 bg-amber-50/60 dark:bg-amber-500/10 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                Estás usando una contraseña temporal
              </p>
              <p className="text-amber-800/80 dark:text-amber-200/80 mt-1">
                Te recomendamos cambiarla ahora mismo.{' '}
                <Link href="/cambiar-password?first=1" className="underline font-medium">
                  Cambiar contraseña
                </Link>
              </p>
            </div>
          </div>
        ) : null}

        <div className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">Contraseña</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Definí una nueva contraseña. Te vamos a pedir la actual para confirmar el cambio.
          </p>
          <ChangePasswordForm requireCurrent={true} />
        </div>

        {visibleNotificationKeys.length > 0 ? (
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-foreground mb-1">Notificaciones por mail</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Mantenemos siempre los mails transaccionales (bienvenida, restablecer contraseña, alertas
              de seguridad). El resto lo controlás vos.
            </p>
            <EmailPreferencesForm initial={preferences} visibleKeys={visibleNotificationKeys} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
