'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  existingExpensePaymentMovementInPostgres,
  getCashAccountWithAdminFromPostgres,
  getExpenseForPaymentFromPostgres,
  getManagedPropertyAdminIdFromPostgres,
  insertBankMovementInPostgres,
  insertCashAccountInPostgres,
  updateCashAccountInPostgres,
} from '@/lib/db/iadmin-writes'

const accountFields = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['bank', 'cash', 'reserve', 'other']),
  bankName: z.string().trim().max(80).nullable().optional(),
  accountNumber: z.string().trim().max(40).nullable().optional(),
  cbu: z.string().trim().max(32).nullable().optional(),
  alias: z.string().trim().max(40).nullable().optional(),
  openingBalance: z.number().optional().default(0),
  openingBalanceAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
})

const createAccountSchema = accountFields.extend({
  propertyId: z.string().uuid(),
})

export async function createCashAccount(input: z.input<typeof createAccountSchema>) {
  const parsed = createAccountSchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'cash_accounts.manage',
    administrationId: property.administration_id,
  })

  const { id } = await insertCashAccountInPostgres({
    managedPropertyId: parsed.propertyId,
    name: parsed.name,
    kind: parsed.kind,
    bankName: parsed.bankName ?? null,
    accountNumber: parsed.accountNumber ?? null,
    cbu: parsed.cbu ?? null,
    alias: parsed.alias ?? null,
    openingBalance: parsed.openingBalance ?? 0,
    openingBalanceAt: parsed.openingBalanceAt ?? null,
    notes: parsed.notes ?? null,
  })

  if ((parsed.openingBalance ?? 0) !== 0) {
    await insertBankMovementInPostgres({
      administrationId: property.administration_id,
      managedPropertyId: parsed.propertyId,
      cashAccountId: id,
      movementDate: parsed.openingBalanceAt ?? new Date().toISOString().slice(0, 10),
      description: 'Saldo de apertura',
      amount: parsed.openingBalance ?? 0,
      externalRef: null,
      movementKind: 'opening',
      createdBy: profile.id,
    })
  }

  await insertIAdminAuditLogInPostgres({
    administrationId: property.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_cash_accounts',
    entityId: id,
    action: 'cash_account.created',
    metadata: { name: parsed.name, kind: parsed.kind },
  })

  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}/cuentas`)
  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
  return { id }
}

const updateAccountSchema = accountFields.partial().extend({
  accountId: z.string().uuid(),
})

export async function updateCashAccount(input: z.input<typeof updateAccountSchema>) {
  const parsed = updateAccountSchema.parse(input)

  const account = await getCashAccountWithAdminFromPostgres(parsed.accountId)
  if (!account) throw new Error('Cuenta no encontrada')

  const { profile } = await requireIAdmin({
    capability: 'cash_accounts.manage',
    administrationId: account.administration_id,
  })

  const patch = {
    name: parsed.name,
    kind: parsed.kind,
    bankName: parsed.bankName,
    accountNumber: parsed.accountNumber,
    cbu: parsed.cbu,
    alias: parsed.alias,
    notes: parsed.notes,
  }
  const hasChanges = Object.values(patch).some((value) => value !== undefined)
  if (!hasChanges) return

  await updateCashAccountInPostgres(parsed.accountId, patch)

  await insertIAdminAuditLogInPostgres({
    administrationId: account.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_cash_accounts',
    entityId: parsed.accountId,
    action: 'cash_account.updated',
    metadata: patch as Record<string, unknown>,
  })

  revalidatePath(`/iadmin/consorcios/${account.managed_property_id}/cuentas`)
  revalidatePath(`/iadmin/consorcios/${account.managed_property_id}`)
}

const toggleAccountSchema = z.object({
  accountId: z.string().uuid(),
  isActive: z.boolean(),
})

export async function setCashAccountActive(input: z.input<typeof toggleAccountSchema>) {
  const parsed = toggleAccountSchema.parse(input)

  const account = await getCashAccountWithAdminFromPostgres(parsed.accountId)
  if (!account) throw new Error('Cuenta no encontrada')

  const { profile } = await requireIAdmin({
    capability: 'cash_accounts.manage',
    administrationId: account.administration_id,
  })

  await updateCashAccountInPostgres(parsed.accountId, { isActive: parsed.isActive })

  await insertIAdminAuditLogInPostgres({
    administrationId: account.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_cash_accounts',
    entityId: parsed.accountId,
    action: parsed.isActive ? 'cash_account.activated' : 'cash_account.archived',
  })

  revalidatePath(`/iadmin/consorcios/${account.managed_property_id}/cuentas`)
  revalidatePath(`/iadmin/consorcios/${account.managed_property_id}`)
}

const manualMovementSchema = z.object({
  cashAccountId: z.string().uuid(),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(240),
  amount: z.number().refine((n) => n !== 0, 'El monto no puede ser 0'),
  externalRef: z.string().trim().max(80).optional(),
  movementKind: z.enum(['manual', 'transfer', 'adjustment']).optional().default('manual'),
})

export async function addManualMovement(input: z.input<typeof manualMovementSchema>) {
  const parsed = manualMovementSchema.parse(input)

  const account = await getCashAccountWithAdminFromPostgres(parsed.cashAccountId)
  if (!account) throw new Error('Cuenta no encontrada')

  const { profile } = await requireIAdmin({
    capability: 'cash_accounts.manage',
    administrationId: account.administration_id,
  })

  await insertBankMovementInPostgres({
    administrationId: account.administration_id,
    managedPropertyId: account.managed_property_id,
    cashAccountId: parsed.cashAccountId,
    movementDate: parsed.movementDate,
    description: parsed.description,
    amount: parsed.amount,
    externalRef: parsed.externalRef ?? null,
    movementKind: parsed.movementKind ?? 'manual',
    createdBy: profile.id,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: account.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_bank_movements',
    entityId: null,
    action: 'movement.created',
    metadata: { amount: parsed.amount, description: parsed.description },
  })

  revalidatePath(`/iadmin/consorcios/${account.managed_property_id}/cuentas`)
  revalidatePath(`/iadmin/consorcios/${account.managed_property_id}`)
}

const payExpenseSchema = z.object({
  expenseId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  externalRef: z.string().trim().max(80).optional(),
})

export async function payExpense(input: z.input<typeof payExpenseSchema>) {
  const parsed = payExpenseSchema.parse(input)

  const expense = await getExpenseForPaymentFromPostgres(parsed.expenseId)
  if (!expense) throw new Error('Gasto no encontrado')
  if (expense.status === 'draft' || expense.status === 'rejected') {
    throw new Error('No se puede pagar un gasto en estado borrador o rechazado')
  }

  const { profile } = await requireIAdmin({
    capability: 'expenses.mark_paid',
    administrationId: expense.administration_id,
  })

  const account = await getCashAccountWithAdminFromPostgres(parsed.cashAccountId)
  if (!account) throw new Error('Cuenta no encontrada')
  if (account.managed_property_id !== expense.managed_property_id) {
    throw new Error('La cuenta no pertenece al consorcio del gasto')
  }

  if (await existingExpensePaymentMovementInPostgres(parsed.expenseId)) {
    throw new Error('Este gasto ya tiene un pago registrado')
  }

  await insertBankMovementInPostgres({
    administrationId: expense.administration_id,
    managedPropertyId: expense.managed_property_id,
    cashAccountId: parsed.cashAccountId,
    movementDate: parsed.movementDate,
    description: `Pago a proveedor: ${expense.description}`,
    amount: -Number(expense.amount),
    externalRef: parsed.externalRef ?? null,
    movementKind: 'expense_payment',
    expenseId: parsed.expenseId,
    createdBy: profile.id,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: expense.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_expenses',
    entityId: parsed.expenseId,
    action: 'expense.paid',
    metadata: { amount: Number(expense.amount), cash_account_id: parsed.cashAccountId },
  })

  revalidatePath(`/iadmin/gastos`)
  revalidatePath(`/iadmin/gastos/${parsed.expenseId}`)
  revalidatePath(`/iadmin/consorcios/${expense.managed_property_id}`)
  revalidatePath(`/iadmin/consorcios/${expense.managed_property_id}/cuentas`)
}
