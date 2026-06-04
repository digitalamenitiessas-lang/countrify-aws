// Logica pura de generacion de reminders. Extraida del action para que
// cron (sin auth de admin) y el boton manual del admin compartan codigo.

import {
  insertReminderInPostgres,
  listExistingRemindersTodayFromPostgres,
  listReminderRunsWithItemsFromPostgres,
  sumLivePaymentsByItemsFromPostgres,
} from '@/lib/db/iadmin-writes'
import type { IAdminReminderKind } from '@/lib/types'

const MESSAGES: Record<IAdminReminderKind, (c: ReminderCandidate) => string> = {
  pre_due: (c) =>
    `Hola ${c.holder_name ?? 'vecino/a'}! Te recordamos que el ${c.due_label} (${c.due_date}) vence el pago de las expensas de tu unidad ${c.unit_code}. Monto a abonar: $${c.amount_due.toLocaleString('es-AR')}.`,
  overdue_first: (c) =>
    `Hola ${c.holder_name ?? 'vecino/a'}! Te informamos que venció el primer vencimiento de expensas de la unidad ${c.unit_code}. Podés abonar el ${c.due_label} (${c.due_date}) por $${c.amount_due.toLocaleString('es-AR')} (con recargo).`,
  overdue_second: (c) =>
    `Hola ${c.holder_name ?? 'vecino/a'}! Las expensas de tu unidad ${c.unit_code} están vencidas. El saldo pendiente es de $${c.amount_due.toLocaleString('es-AR')}. Por favor regulariza a la brevedad.`,
  overdue_heavy: (c) =>
    `Hola ${c.holder_name ?? 'vecino/a'}! Tu unidad ${c.unit_code} tiene una deuda acumulada de $${c.amount_due.toLocaleString('es-AR')} de expensas vencidas hace mas de un mes. Contactanos para acordar el pago.`,
}

type ReminderCandidate = {
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

export interface GenerateRemindersOptions {
  administrationId: string
  managedPropertyId?: string | null
  daysBeforeDue?: number
}

export interface GenerateRemindersResult {
  created: number
  skipped: number
}

// Devuelve { created, skipped } al insertar reminders para items con saldo
// pendiente. No autentica al caller — es responsabilidad del caller (action
// o cron endpoint) hacer el gate de seguridad.
export async function generateRemindersForAdmin(
  options: GenerateRemindersOptions,
): Promise<GenerateRemindersResult> {
  const daysBeforeDue = options.daysBeforeDue ?? 3

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const flatRows = await listReminderRunsWithItemsFromPostgres({
    administrationId: options.administrationId,
    managedPropertyId: options.managedPropertyId ?? null,
  })

  type RunGroup = {
    id: string
    managed_property_id: string
    due_dates: unknown
    items: Array<{
      id: string
      ordinary_amount: string | null
      extraordinary_amount: string | null
      particular_amount: string | null
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
      particular_amount: row.particular_amount,
      previous_balance: row.previous_balance,
      unit_code: row.unit_code,
      holder_name: row.holder_full_name,
      holder_phone: row.holder_phone,
    })
  }

  const allItemIds = Array.from(runsById.values()).flatMap((r) => r.items.map((i) => i.id))
  const paidByItem =
    allItemIds.length > 0
      ? await sumLivePaymentsByItemsFromPostgres(allItemIds)
      : new Map<string, number>()

  const candidates: ReminderCandidate[] = []

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
        Number(it.particular_amount ?? 0) +
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

      if (daysToFirst !== null && daysToFirst >= 0 && daysToFirst <= daysBeforeDue) {
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

  if (candidates.length === 0) return { created: 0, skipped: 0 }

  const todayStr = today.toISOString().slice(0, 10)
  const existingKeys = await listExistingRemindersTodayFromPostgres({
    liquidationItemIds: candidates.map((c) => c.liquidation_item_id),
    todayDate: todayStr,
  })

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
        administrationId: options.administrationId,
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
      // Si choca con el unique index (alguien lo creo en paralelo), lo
      // contamos como skipped en vez de tirar.
      skipped += 1
    }
  }

  return { created, skipped }
}
