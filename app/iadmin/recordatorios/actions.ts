'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  bulkUpdatePendingRemindersInPostgres,
  getReminderAdminFromPostgres,
  insertReminderInPostgres,
  listExistingRemindersTodayFromPostgres,
  listReminderRunsWithItemsFromPostgres,
  setReminderStatusInPostgres,
  sumLivePaymentsByItemsFromPostgres,
} from '@/lib/db/iadmin-writes'
import type { IAdminReminderKind } from '@/lib/types'

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

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const flatRows = await listReminderRunsWithItemsFromPostgres({
    administrationId: parsed.administrationId,
    managedPropertyId: parsed.propertyId ?? null,
  })

  // Group by run
  type RunGroup = {
    id: string
    managed_property_id: string
    due_dates: any
    items: Array<{
      id: string
      ordinary_amount: string | null
      extraordinary_amount: string | null
      previous_balance: string | null
      unit_code: string | null
      holder_name: string | null
      holder_phone: string | null
    }>
  }
  const runsById = new Map<string, RunGroup>()
  for (const row of flatRows) {
    let run = runsById.get(row.run_id)
    if (!run) {
      run = {
        id: row.run_id,
        managed_property_id: row.managed_property_id,
        due_dates: row.due_dates,
        items: [],
      }
      runsById.set(row.run_id, run)
    }
    run.items.push({
      id: row.item_id,
      ordinary_amount: row.ordinary_amount,
      extraordinary_amount: row.extraordinary_amount,
      previous_balance: row.previous_balance,
      unit_code: row.unit_code,
      holder_name: row.holder_full_name,
      holder_phone: row.holder_phone,
    })
  }

  const runIds = Array.from(runsById.keys())
  const paidByItem = await sumLivePaymentsByItemsFromPostgres(runIds)

  type Candidate = {
    liquidation_item_id: string
    reminder_kind: IAdminReminderKind
    managed_property_id: string
    amount_due: number
    due_label: string
    due_date: string
    unit_code: string
    holder_name: string | null
    holder_phone: string | null
  }

  const candidates: Candidate[] = []

  for (const run of runsById.values()) {
    const dueDates = (run.due_dates ?? []) as Array<{
      label?: string
      date?: string
      surcharge_pct?: number
      surchargePct?: number
    }>
    if (dueDates.length === 0) continue
    const sortedDues = [...dueDates]
      .map((d) => ({
        label: d.label ?? '',
        date: d.date ?? '',
        pct: Number(d.surcharge_pct ?? d.surchargePct ?? 0),
      }))
      .filter((d) => d.date)
      .sort((a, b) => a.date.localeCompare(b.date))

    for (const it of run.items) {
      const subtotal =
        Number(it.ordinary_amount ?? 0) +
        Number(it.extraordinary_amount ?? 0) +
        Number(it.previous_balance ?? 0)
      const paid = paidByItem.get(it.id) ?? 0
      const balance = subtotal - paid
      if (balance <= 0.01) continue

      const firstDue = sortedDues[0]
      const lastDue = sortedDues[sortedDues.length - 1]

      const firstDueDate = firstDue ? new Date(firstDue.date) : null
      const lastDueDate = lastDue ? new Date(lastDue.date) : null
      if (firstDueDate) firstDueDate.setHours(0, 0, 0, 0)
      if (lastDueDate) lastDueDate.setHours(0, 0, 0, 0)

      const daysToFirst = firstDueDate
        ? Math.round((firstDueDate.getTime() - today.getTime()) / 86_400_000)
        : null
      const daysSinceLast = lastDueDate
        ? Math.round((today.getTime() - lastDueDate.getTime()) / 86_400_000)
        : null

      let kind: IAdminReminderKind | null = null
      let dueLabel = firstDue?.label ?? ''
      let dueDate = firstDue?.date ?? ''
      let effectiveAmount = Math.round(balance * 100) / 100

      if (daysToFirst !== null && daysToFirst >= 0 && daysToFirst <= parsed.daysBeforeDue) {
        kind = 'pre_due'
      } else if (
        daysToFirst !== null &&
        daysToFirst < 0 &&
        sortedDues.length > 1 &&
        lastDueDate &&
        today < lastDueDate
      ) {
        kind = 'overdue_first'
        const second = sortedDues[1]
        dueLabel = second.label
        dueDate = second.date
        effectiveAmount = Math.round(subtotal * (1 + second.pct / 100) * 100) / 100 - paid
      } else if (daysSinceLast !== null && daysSinceLast >= 0 && daysSinceLast <= 30) {
        kind = 'overdue_second'
        dueLabel = lastDue.label
        dueDate = lastDue.date
      } else if (daysSinceLast !== null && daysSinceLast > 30) {
        kind = 'overdue_heavy'
        dueLabel = lastDue.label
        dueDate = lastDue.date
      }

      if (!kind) continue

      candidates.push({
        liquidation_item_id: it.id,
        reminder_kind: kind,
        managed_property_id: run.managed_property_id,
        amount_due: Math.max(0, Math.round(effectiveAmount * 100) / 100),
        due_label: dueLabel,
        due_date: dueDate,
        unit_code: it.unit_code ?? '—',
        holder_name: it.holder_name,
        holder_phone: it.holder_phone,
      })
    }
  }

  if (candidates.length === 0) {
    return { created: 0, skipped: 0 }
  }

  const todayStr = today.toISOString().slice(0, 10)
  const existingKeys = await listExistingRemindersTodayFromPostgres({
    liquidationItemIds: candidates.map((c) => c.liquidation_item_id),
    todayDate: todayStr,
  })

  const MESSAGES: Record<IAdminReminderKind, (c: Candidate) => string> = {
    pre_due: (c) =>
      `Hola ${c.holder_name ?? 'vecino/a'}! Te recordamos que el ${c.due_label} (${c.due_date}) vence el pago de las expensas de tu unidad ${c.unit_code}. Monto a abonar: $${c.amount_due.toLocaleString('es-AR')}.`,
    overdue_first: (c) =>
      `Hola ${c.holder_name ?? 'vecino/a'}! Te informamos que venció el primer vencimiento de expensas de la unidad ${c.unit_code}. Podés abonar el ${c.due_label} (${c.due_date}) por $${c.amount_due.toLocaleString('es-AR')} (con recargo).`,
    overdue_second: (c) =>
      `Hola ${c.holder_name ?? 'vecino/a'}! Las expensas de tu unidad ${c.unit_code} están vencidas. El saldo pendiente es de $${c.amount_due.toLocaleString('es-AR')}. Por favor regulariza a la brevedad.`,
    overdue_heavy: (c) =>
      `Hola ${c.holder_name ?? 'vecino/a'}! Tu unidad ${c.unit_code} tiene una deuda acumulada de $${c.amount_due.toLocaleString('es-AR')} de expensas vencidas hace mas de un mes. Contactanos para acordar el pago.`,
  }

  let created = 0
  let skipped = 0
  for (const c of candidates) {
    const key = `${c.liquidation_item_id}::${c.reminder_kind}`
    if (existingKeys.has(key)) {
      skipped += 1
      continue
    }
    try {
      await insertReminderInPostgres({
        administrationId: parsed.administrationId,
        managedPropertyId: c.managed_property_id,
        liquidationItemId: c.liquidation_item_id,
        reminderKind: c.reminder_kind,
        amountDue: c.amount_due,
        dueLabel: c.due_label,
        dueDate: c.due_date,
        messageBody: MESSAGES[c.reminder_kind](c),
      })
      created += 1
    } catch {
      skipped += 1
    }
  }

  await insertIAdminAuditLogInPostgres({
    administrationId: parsed.administrationId,
    actorProfileId: profile.id,
    entityType: 'iadmin_reminders',
    entityId: null,
    action: 'reminders.generated',
    metadata: { created, skipped, property_id: parsed.propertyId ?? null },
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
