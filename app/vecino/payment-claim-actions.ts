'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth'
import { pgQuery } from '@/lib/db/postgres'

const submitSchema = z.object({
  unitId: z.string().uuid(),
  liquidationItemId: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  paidAtClaimed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.string().trim().max(40).optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  documentObjectKey: z.string().trim().max(500).optional(),
})

export async function submitPaymentClaim(input: z.input<typeof submitSchema>): Promise<{ id: string }> {
  const parsed = submitSchema.parse(input)
  const { profile } = await requireProfile(['vecino', 'super_admin'])

  // El vecino principal es el responsable de pago de la unidad.
  const membership = await pgQuery<{ administration_id: string; managed_property_id: string }>(
    `select mp.administration_id, mp.id as managed_property_id
       from public.unit_profile_memberships m
       join public.iadmin_units u on u.id = m.unit_id
       join public.iadmin_managed_properties mp on mp.id = u.managed_property_id
      where m.unit_id = $1
        and m.profile_id = $2
        and m.relationship_type = 'vecino_principal'
        and m.active = true
      limit 1`,
    [parsed.unitId, profile.id],
  )
  const m = membership.rows[0]
  if (!m) {
    throw new Error('No estás autorizado para reportar pagos de esta unidad.')
  }

  const result = await pgQuery<{ id: string }>(
    `insert into public.iadmin_payment_claims (
       administration_id, managed_property_id, unit_id, liquidation_item_id,
       reporter_profile_id, amount, paid_at_claimed, method, reference, notes,
       document_object_key, status
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending')
     returning id`,
    [
      m.administration_id,
      m.managed_property_id,
      parsed.unitId,
      parsed.liquidationItemId ?? null,
      profile.id,
      parsed.amount,
      parsed.paidAtClaimed,
      parsed.method ?? null,
      parsed.reference ?? null,
      parsed.notes ?? null,
      parsed.documentObjectKey ?? null,
    ],
  )

  revalidatePath('/vecino')
  return { id: result.rows[0].id }
}
