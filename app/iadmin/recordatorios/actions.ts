'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  bulkUpdatePendingRemindersInPostgres,
  getReminderAdminFromPostgres,
  setReminderStatusInPostgres,
} from '@/lib/db/iadmin-writes'
import { generateRemindersForAdmin } from '@/lib/iadmin/reminder-generator'
import { notifyReminderByEmail } from '@/lib/email/notifications/reminders'

const generateSchema = z.object({
  administrationId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  daysBeforeDue: z.number().int().min(0).max(30).optional().default(3),
})

export type GenerateRemindersResult = {
  created: number
  skipped: number
}

export async function generateReminders(
  input: z.input<typeof generateSchema>,
): Promise<GenerateRemindersResult> {
  const parsed = generateSchema.parse(input)
  const { profile } = await requireIAdmin({
    capability: 'reminders.generate',
    administrationId: parsed.administrationId,
  })

  const { created, skipped } = await generateRemindersForAdmin({
    administrationId: parsed.administrationId,
    managedPropertyId: parsed.propertyId ?? null,
    daysBeforeDue: parsed.daysBeforeDue,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: parsed.administrationId,
    actorProfileId: profile.id,
    entityType: 'iadmin_reminders',
    entityId: null,
    action: 'reminders.generated',
    metadata: { created, skipped, property_id: parsed.propertyId ?? null, source: 'admin' },
  })

  revalidatePath('/iadmin/recordatorios')
  return { created, skipped }
}

const markSchema = z.object({
  reminderId: z.string().uuid(),
  action: z.enum(['sent', 'dismissed']),
  notes: z.string().trim().max(500).optional(),
})

export async function updateReminderStatus(input: z.input<typeof markSchema>) {
  const parsed = markSchema.parse(input)

  const reminder = await getReminderAdminFromPostgres(parsed.reminderId)
  if (!reminder) throw new Error('Recordatorio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'reminders.send',
    administrationId: reminder.administration_id,
  })

  await setReminderStatusInPostgres({
    reminderId: parsed.reminderId,
    status: parsed.action,
    actorProfileId: profile.id,
    notes: parsed.notes ?? null,
  })

  revalidatePath('/iadmin/recordatorios')
}

const sendEmailSchema = z.object({
  reminderId: z.string().uuid(),
})

export async function sendReminderByEmail(
  input: z.input<typeof sendEmailSchema>,
): Promise<{ sent: number }> {
  const parsed = sendEmailSchema.parse(input)

  const reminder = await getReminderAdminFromPostgres(parsed.reminderId)
  if (!reminder) throw new Error('Recordatorio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'reminders.send',
    administrationId: reminder.administration_id,
  })

  const { sent } = await notifyReminderByEmail({
    reminderId: parsed.reminderId,
    actorProfileId: profile.id,
  })

  if (sent > 0) {
    await setReminderStatusInPostgres({
      reminderId: parsed.reminderId,
      status: 'sent',
      actorProfileId: profile.id,
      notes: null,
    })
    await insertIAdminAuditLogInPostgres({
      administrationId: reminder.administration_id,
      actorProfileId: profile.id,
      entityType: 'iadmin_reminders',
      entityId: parsed.reminderId,
      action: 'reminder.sent_email',
      metadata: { sent },
    })
  }

  revalidatePath('/iadmin/recordatorios')
  return { sent }
}

const bulkSchema = z.object({
  administrationId: z.string().uuid(),
  reminderIds: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(['sent', 'dismissed']),
})

export async function bulkUpdateReminders(
  input: z.input<typeof bulkSchema>,
): Promise<{ updated: number }> {
  const parsed = bulkSchema.parse(input)
  const { profile } = await requireIAdmin({
    capability: 'reminders.send',
    administrationId: parsed.administrationId,
  })

  const updated = await bulkUpdatePendingRemindersInPostgres({
    administrationId: parsed.administrationId,
    reminderIds: parsed.reminderIds,
    status: parsed.action,
    actorProfileId: profile.id,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: parsed.administrationId,
    actorProfileId: profile.id,
    entityType: 'iadmin_reminders',
    entityId: null,
    action: `reminders.bulk_${parsed.action}`,
    metadata: { count: updated },
  })

  revalidatePath('/iadmin/recordatorios')
  return { updated }
}
