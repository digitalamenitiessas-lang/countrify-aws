'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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

  const supabase = await getSupabaseServerClient()
  if (!supabase) throw new Error('Supabase no configurado')

  const { data, error } = await supabase
    .from('iadmin_providers')
    .insert({
      administration_id: parsed.administrationId,
      name: parsed.name,
      tax_id: parsed.taxId ?? null,
      category: parsed.category ?? null,
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      notes: parsed.notes ?? null,
      is_recurring: parsed.isRecurring ?? false,
      recurring_amount: parsed.recurringAmount ?? null,
      recurring_kind: parsed.recurringKind ?? 'ordinaria',
      is_active: true,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  await supabase.from('iadmin_audit_logs').insert({
    administration_id: parsed.administrationId,
    actor_profile_id: profile.id,
    entity_type: 'iadmin_providers',
    entity_id: data.id,
    action: 'provider.created',
    metadata: { name: parsed.name },
  })

  revalidatePath('/iadmin/proveedores')
  return { id: data.id as string }
}

const updateProviderSchema = providerFields.partial().extend({
  providerId: z.string().uuid(),
})

export async function updateProvider(input: z.input<typeof updateProviderSchema>) {
  const parsed = updateProviderSchema.parse(input)
  const supabase = await getSupabaseServerClient()
  if (!supabase) throw new Error('Supabase no configurado')

  const { data: provider } = await supabase
    .from('iadmin_providers')
    .select('id, administration_id')
    .eq('id', parsed.providerId)
    .maybeSingle()
  if (!provider) throw new Error('Proveedor no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'providers.manage',
    administrationId: provider.administration_id,
  })

  const patch: Record<string, unknown> = {}
  if (parsed.name !== undefined) patch.name = parsed.name
  if (parsed.taxId !== undefined) patch.tax_id = parsed.taxId
  if (parsed.category !== undefined) patch.category = parsed.category
  if (parsed.email !== undefined) patch.email = parsed.email
  if (parsed.phone !== undefined) patch.phone = parsed.phone
  if (parsed.notes !== undefined) patch.notes = parsed.notes
  if (parsed.isRecurring !== undefined) patch.is_recurring = parsed.isRecurring
  if (parsed.recurringAmount !== undefined) patch.recurring_amount = parsed.recurringAmount
  if (parsed.recurringKind !== undefined) patch.recurring_kind = parsed.recurringKind
  if (Object.keys(patch).length === 0) return

  const { error } = await supabase.from('iadmin_providers').update(patch).eq('id', parsed.providerId)
  if (error) throw new Error(error.message)

  await supabase.from('iadmin_audit_logs').insert({
    administration_id: provider.administration_id,
    actor_profile_id: profile.id,
    entity_type: 'iadmin_providers',
    entity_id: parsed.providerId,
    action: 'provider.updated',
    metadata: patch,
  })

  revalidatePath('/iadmin/proveedores')
}

const setProviderActiveSchema = z.object({
  providerId: z.string().uuid(),
  isActive: z.boolean(),
})

export async function setProviderActive(input: z.input<typeof setProviderActiveSchema>) {
  const parsed = setProviderActiveSchema.parse(input)
  const supabase = await getSupabaseServerClient()
  if (!supabase) throw new Error('Supabase no configurado')

  const { data: provider } = await supabase
    .from('iadmin_providers')
    .select('id, administration_id')
    .eq('id', parsed.providerId)
    .maybeSingle()
  if (!provider) throw new Error('Proveedor no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'providers.manage',
    administrationId: provider.administration_id,
  })

  const { error } = await supabase
    .from('iadmin_providers')
    .update({ is_active: parsed.isActive })
    .eq('id', parsed.providerId)
  if (error) throw new Error(error.message)

  await supabase.from('iadmin_audit_logs').insert({
    administration_id: provider.administration_id,
    actor_profile_id: profile.id,
    entity_type: 'iadmin_providers',
    entity_id: parsed.providerId,
    action: parsed.isActive ? 'provider.activated' : 'provider.deactivated',
  })

  revalidatePath('/iadmin/proveedores')
}
