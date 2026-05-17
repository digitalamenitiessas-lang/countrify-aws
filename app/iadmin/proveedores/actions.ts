'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import {
  createIAdminProviderInPostgres,
  getIAdminProviderByIdFromPostgres,
  insertIAdminAuditLogInPostgres,
  updateIAdminProviderInPostgres,
} from '@/lib/db/iadmin-core'

const providerFields = z.object({
  name: z.string().trim().min(1).max(120),
  taxId: z.string().trim().max(20).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().max(120).nullable().optional().or(z.literal('').transform(() => null)),
  phone: z.string().trim().max(30).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  isRecurring: z.boolean().optional(),
  recurringAmount: z.number().nonnegative().nullable().optional(),
  recurringKind: z.enum(['ordinaria', 'extraordinaria']).optional(),
})

const createProviderSchema = providerFields.extend({
  administrationId: z.string().uuid(),
})

export async function createProvider(input: z.input<typeof createProviderSchema>) {
  const parsed = createProviderSchema.parse(input)
  const { profile } = await requireIAdmin({
    capability: 'providers.manage',
    administrationId: parsed.administrationId,
  })

  const { id } = await createIAdminProviderInPostgres({
    administrationId: parsed.administrationId,
    name: parsed.name,
    taxId: parsed.taxId ?? null,
    category: parsed.category ?? null,
    email: parsed.email ?? null,
    phone: parsed.phone ?? null,
    notes: parsed.notes ?? null,
    isRecurring: parsed.isRecurring ?? false,
    recurringAmount: parsed.recurringAmount ?? null,
    recurringKind: parsed.recurringKind ?? 'ordinaria',
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: parsed.administrationId,
    actorProfileId: profile.id,
    entityType: 'iadmin_providers',
    entityId: id,
    action: 'provider.created',
    metadata: { name: parsed.name },
  })

  revalidatePath('/iadmin/proveedores')
  return { id }
}

const updateProviderSchema = providerFields.partial().extend({
  providerId: z.string().uuid(),
})

export async function updateProvider(input: z.input<typeof updateProviderSchema>) {
  const parsed = updateProviderSchema.parse(input)

  const provider = await getIAdminProviderByIdFromPostgres(parsed.providerId)
  if (!provider) throw new Error('Proveedor no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'providers.manage',
    administrationId: provider.administration_id,
  })

  const patch = {
    name: parsed.name,
    taxId: parsed.taxId,
    category: parsed.category,
    email: parsed.email,
    phone: parsed.phone,
    notes: parsed.notes,
    isRecurring: parsed.isRecurring,
    recurringAmount: parsed.recurringAmount,
    recurringKind: parsed.recurringKind,
  }

  const hasChanges = Object.values(patch).some((value) => value !== undefined)
  if (!hasChanges) return

  await updateIAdminProviderInPostgres(parsed.providerId, patch)

  await insertIAdminAuditLogInPostgres({
    administrationId: provider.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_providers',
    entityId: parsed.providerId,
    action: 'provider.updated',
    metadata: patch as Record<string, unknown>,
  })

  revalidatePath('/iadmin/proveedores')
}

const setProviderActiveSchema = z.object({
  providerId: z.string().uuid(),
  isActive: z.boolean(),
})

export async function setProviderActive(input: z.input<typeof setProviderActiveSchema>) {
  const parsed = setProviderActiveSchema.parse(input)

  const provider = await getIAdminProviderByIdFromPostgres(parsed.providerId)
  if (!provider) throw new Error('Proveedor no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'providers.manage',
    administrationId: provider.administration_id,
  })

  await updateIAdminProviderInPostgres(parsed.providerId, { isActive: parsed.isActive })

  await insertIAdminAuditLogInPostgres({
    administrationId: provider.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_providers',
    entityId: parsed.providerId,
    action: parsed.isActive ? 'provider.activated' : 'provider.deactivated',
  })

  revalidatePath('/iadmin/proveedores')
}
