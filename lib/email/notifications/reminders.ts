import { pgQuery } from '@/lib/db/postgres'
import { sendNotificationEmail } from '@/lib/email/send'
import { renderReminderEmail } from '@/lib/email/templates/reminder'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://countrify.com.ar'

interface ReminderContext {
  reminder_id: string
  administration_id: string
  reminder_kind: 'pre_due' | 'overdue_first' | 'overdue_second' | 'overdue_heavy'
  amount_due: string | null
  due_label: string | null
  due_date: string | null
  message_body: string | null
  unit_id: string
  unit_code: string
  property_display_name: string | null
  building_name: string
  share_token: string | null
}

interface RecipientRow {
  profile_id: string
  email: string
  full_name: string
}

// notifyReminderByEmail: manda el recordatorio por mail a los responsables
// del pago (propietario + vecino_principal) de la unidad. Retorna count
// de mails efectivamente enviados (puede ser 0 si todos estan blocked /
// con preferencia off).
export async function notifyReminderByEmail(input: {
  reminderId: string
  actorProfileId: string
}): Promise<{ sent: number }> {
  const ctxRes = await pgQuery<ReminderContext>(
    `
      select
        rem.id as reminder_id,
        rem.administration_id,
        rem.reminder_kind::text as reminder_kind,
        rem.amount_due::text as amount_due,
        rem.due_label,
        rem.due_date::text as due_date,
        rem.message_body,
        li.unit_id,
        u.code as unit_code,
        mp.display_name as property_display_name,
        b.name as building_name,
        t.token as share_token
      from public.iadmin_reminders rem
      join public.iadmin_liquidation_items li on li.id = rem.liquidation_item_id
      join public.iadmin_liquidation_runs lr on lr.id = li.liquidation_run_id
      join public.iadmin_managed_properties mp on mp.id = lr.managed_property_id
      join public.buildings b on b.id = mp.building_id
      join public.iadmin_units u on u.id = li.unit_id
      left join public.iadmin_item_share_tokens t
        on t.liquidation_item_id = li.id and t.revoked_at is null
      where rem.id = $1
      limit 1
    `,
    [input.reminderId],
  )
  const ctx = ctxRes.rows[0]
  if (!ctx) return { sent: 0 }

  // Propietario + vecino_principal de la unidad. Dedup por profile_id.
  const recRes = await pgQuery<RecipientRow>(
    `
      select distinct on (m.profile_id)
        m.profile_id, p.email, p.full_name
      from public.unit_profile_memberships m
      join public.profiles p on p.id = m.profile_id
      where m.unit_id = $1
        and m.relationship_type = 'vecino_principal'
        and m.active = true
    `,
    [ctx.unit_id],
  )
  const recipients = recRes.rows
  if (recipients.length === 0) return { sent: 0 }

  const propertyName = ctx.property_display_name?.trim() || ctx.building_name
  const publicLink = ctx.share_token ? `${SITE_URL}/l/${ctx.share_token}` : null
  const amount = Number(ctx.amount_due ?? 0)

  let sent = 0
  for (const r of recipients) {
    try {
      const tpl = renderReminderEmail({
        recipientName: r.full_name,
        propertyName,
        unitCode: ctx.unit_code,
        reminderKind: ctx.reminder_kind,
        amountDue: amount,
        dueLabel: ctx.due_label ?? '',
        dueDate: ctx.due_date ?? '',
        messageBody: ctx.message_body ?? '',
        publicLink,
      })
      const result = await sendNotificationEmail({
        templateKey: 'reminder',
        to: { email: r.email, profileId: r.profile_id, fullName: r.full_name },
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        preferenceKey: 'reminders',
        // Dedup por reminder+recipient: cada reminder es unico (unique
        // index daily por item+kind), asi que esto evita doble-envio si
        // el admin hace click dos veces.
        idempotencyKey: `reminder:${input.reminderId}:${r.profile_id}`,
        metadata: {
          reminderId: input.reminderId,
          unitId: ctx.unit_id,
          unitCode: ctx.unit_code,
          reminderKind: ctx.reminder_kind,
        },
      })
      if (result.status === 'sent') sent += 1
    } catch (err) {
      console.error('[email/notifyReminderByEmail] recipient failed (non-blocking)', err)
    }
  }
  return { sent }
}
