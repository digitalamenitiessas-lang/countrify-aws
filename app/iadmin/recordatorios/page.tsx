import { RemindersInbox } from '@/components/admin-backoffice/recordatorios/reminders-inbox'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminPortfolio, getIAdminReminders } from '@/lib/data'

export default async function RecordatoriosPage() {
  const { context } = await requireIAdmin({ capability: 'reminders.generate' })

  const administrationId = context.primary?.administration.id
  if (!administrationId) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        Tu cuenta no tiene una administracion asignada todavia.
      </div>
    )
  }

  const [reminders, portfolio] = await Promise.all([
    getIAdminReminders(administrationId, { status: 'all', limit: 200 }),
    getIAdminPortfolio(administrationId),
  ])

  return (
    <div className="space-y-6">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Recordatorios</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Bandeja de avisos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generá recordatorios del día según los vencimientos y el estado de pago de cada vecino.
          Mandás por WhatsApp con un click y se marca automáticamente como enviado.
        </p>
      </header>

      <RemindersInbox
        administrationId={administrationId}
        reminders={reminders}
        properties={(portfolio?.properties ?? []).map((p) => ({
          id: p.id,
          displayName: p.displayName,
          buildingName: p.buildingName,
        }))}
      />
    </div>
  )
}
