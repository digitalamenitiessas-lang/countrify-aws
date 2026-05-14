'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
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

/**
 * Recorre las liquidaciones issued/closed de la administracion y crea
 * recordatorios pendientes segun la relacion de la fecha de hoy con los
 * vencimientos del item.
 *
 * Tipos:
 *  - pre_due: falta N dias para el primer vencimiento (amable)
 *  - overdue_first: ya paso el 1er venc, aun no llego el 2do
 *  - overdue_second: ya paso el 2do venc (o unico venc) hasta 30 dias
 *  - overdue_heavy: mas de 30 dias de mora
 *
 * Idempotente: no duplica recordatorios del mismo item+kind+dia.
 */
export async function generateReminders(
  input: z.input<typeof generateSchema>,
): Promise<GenerateRemindersResult> {
  const parsed = generateSchema.parse(input)
  const { profile } = await requireIAdmin({
    capability: 'reminders.generate',
    administrationId: parsed.administrationId,
  })

  const supabase = await getSupabaseServerClient()
  if (!supabase) throw new Error('Supabase no configurado')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Runs issued/closed de la administracion (con opcion de filtrar por property)
  let query = supabase
    .from('iadmin_liquidation_runs')
    .select(`
      id, managed_property_id, due_dates,
      iadmin_liquidation_items (
        id,
        ordinary_amount, extraordinary_amount, previous_balance,
        iadmin_units ( code, iadmin_unit_holders(full_name, phone, email, is_active) )
      )
    `)
    .eq('administration_id', parsed.administrationId)
    .in('status', ['issued', 'closed'])

  if (parsed.propertyId) {
    query = query.eq('managed_property_id', parsed.propertyId)
  }

  const { data: runs } = await query

  // Traer pagos vivos en batch
  const runIds = (runs ?? []).map((r: any) => r.id)
  const paidByItem = new Map<string, number>()
  if (runIds.length > 0) {
    const { data: payments } = await supabase
      .from('iadmin_payments')
      .select('liquidation_item_id, amount')
      .in('liquidation_run_id', runIds)
      .eq('is_void', false)
    for (const p of payments ?? []) {
      if (!p.liquidation_item_id) continue
      paidByItem.set(p.liquidation_item_id, (paidByItem.get(p.liquidation_item_id) ?? 0) + Number(p.amount))
    }
  }

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

  for (const run of runs ?? []) {
    const dueDates = (run.due_dates ?? []) as Array<{ label?: string; date?: string; surcharge_pct?: number; surchargePct?: number }>
    if (dueDates.length === 0) continue
    const sortedDues = [...dueDates]
      .map((d) => ({
        label: d.label ?? '',
        date: d.date ?? '',
        pct: Number(d.surcharge_pct ?? d.surchargePct ?? 0),
      }))
      .filter((d) => d.date)
      .sort((a, b) => a.date.localeCompare(b.date))

    const items = Array.isArray(run.iadmin_liquidation_items) ? run.iadmin_liquidation_items : []
    for (const it of items) {
      const subtotal =
        Number(it.ordinary_amount ?? 0) + Number(it.extraordinary_amount ?? 0) + Number(it.previous_balance ?? 0)
      const paid = paidByItem.get(it.id) ?? 0
      const balance = subtotal - paid
      if (balance <= 0.01) continue

      const unit = Array.isArray(it.iadmin_units) ? it.iadmin_units[0] : it.iadmin_units
      const holders = Array.isArray(unit?.iadmin_unit_holders) ? unit.iadmin_unit_holders : []
      const holder = holders.find((h: any) => h?.is_active) ?? holders[0] ?? null

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
      } else if (daysToFirst !== null && daysToFirst < 0 && sortedDues.length > 1 && lastDueDate && today < lastDueDate) {
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
        unit_code: unit?.code ?? '—',
        holder_name: holder?.full_name ?? null,
        holder_phone: holder?.phone ?? null,
      })
    }
  }

  if (candidates.length === 0) {
    return { created: 0, skipped: 0 }
  }

  // Chequear existentes del día
  const todayStr = today.toISOString().slice(0, 10)
  const { data: existing } = await supabase
    .from('iadmin_reminders')
    .select('liquidation_item_id, reminder_kind, generated_at')
    .in(
      'liquidation_item_id',
      candidates.map((c) => c.liquidation_item_id),
    )
    .gte('generated_at', `${todayStr}T00:00:00Z`)

  const existingKeys = new Set((existing ?? []).map((r: any) => `${r.liquidation_item_id}::${r.reminder_kind}`))

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
    const { error } = await supabase.from('iadmin_reminders').insert({
      administration_id: parsed.administrationId,
      managed_property_id: c.managed_property_id,
      liquidation_item_id: c.liquidation_item_id,
      reminder_kind: c.reminder_kind,
      status: 'pending',
      amount_due: c.amount_due,
      due_label: c.due_label,
      due_date: c.due_date,
      message_body: MESSAGES[c.reminder_kind](c),
    })
    if (error) {
      skipped += 1
    } else {
      created += 1
    }
  }

  await supabase.from('iadmin_audit_logs').insert({
    administration_id: parsed.administrationId,
    actor_profile_id: profile.id,
    entity_type: 'iadmin_reminders',
    entity_id: null,
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
  const supabase = await getSupabaseServerClient()
  if (!supabase) throw new Error('Supabase no configurado')

  const { data: reminder } = await supabase
    .from('iadmin_reminders')
    .select('id, administration_id')
    .eq('id', parsed.reminderId)
    .maybeSingle()
  if (!reminder) throw new Error('Recordatorio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'reminders.send',
    administrationId: reminder.administration_id,
  })

  const patch: Record<string, unknown> = {
    status: parsed.action,
  }
  if (parsed.action === 'sent') {
    patch.sent_at = new Date().toISOString()
    patch.sent_by = profile.id
  } else {
    patch.dismissed_at = new Date().toISOString()
    patch.dismissed_by = profile.id
    if (parsed.notes) patch.notes = parsed.notes
  }

  const { error } = await supabase.from('iadmin_reminders').update(patch).eq('id', parsed.reminderId)
  if (error) throw new Error(error.message)

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
  const supabase = await getSupabaseServerClient()
  if (!supabase) throw new Error('Supabase no configurado')

  const { profile } = await requireIAdmin({
    capability: 'reminders.send',
    administrationId: parsed.administrationId,
  })

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: parsed.action }
  if (parsed.action === 'sent') {
    patch.sent_at = now
    patch.sent_by = profile.id
  } else {
    patch.dismissed_at = now
    patch.dismissed_by = profile.id
  }

  const { error, count } = await supabase
    .from('iadmin_reminders')
    .update(patch, { count: 'exact' })
    .eq('administration_id', parsed.administrationId)
    .in('id', parsed.reminderIds)
    .eq('status', 'pending')

  if (error) throw new Error(error.message)

  await supabase.from('iadmin_audit_logs').insert({
    administration_id: parsed.administrationId,
    actor_profile_id: profile.id,
    entity_type: 'iadmin_reminders',
    entity_id: null,
    action: `reminders.bulk_${parsed.action}`,
    metadata: { count: count ?? 0 },
  })

  revalidatePath('/iadmin/recordatorios')
  return { updated: count ?? 0 }
}
