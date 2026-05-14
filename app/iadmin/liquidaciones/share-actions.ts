'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const createShareTokenSchema = z.object({
  liquidationItemId: z.string().uuid(),
  expiresInDays: z.number().int().min(1).max(365).optional().default(60),
})

export type CreateShareTokenResult = {
  token: string
  url: string
  expiresAt: string | null
}

function randomToken(): string {
  // 24 chars base64url-ish sin padding
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function createLiquidationItemShareToken(
  input: z.input<typeof createShareTokenSchema>,
): Promise<CreateShareTokenResult> {
  const parsed = createShareTokenSchema.parse(input)
  const supabase = await getSupabaseServerClient()
  if (!supabase) throw new Error('Supabase no configurado')

  const { data: item } = await supabase
    .from('iadmin_liquidation_items')
    .select('id, liquidation_run_id, iadmin_liquidation_runs!inner(administration_id, managed_property_id)')
    .eq('id', parsed.liquidationItemId)
    .maybeSingle()
  if (!item) throw new Error('Item de liquidacion no encontrado')
  const run = Array.isArray(item.iadmin_liquidation_runs) ? item.iadmin_liquidation_runs[0] : item.iadmin_liquidation_runs
  const administrationId = run?.administration_id as string

  const { profile } = await requireIAdmin({
    capability: 'liquidations.share',
    administrationId,
  })

  // Revocar tokens anteriores vivos (solo 1 activo por item)
  await supabase
    .from('iadmin_item_share_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('liquidation_item_id', parsed.liquidationItemId)
    .is('revoked_at', null)

  const token = randomToken()
  const expiresAt = new Date(Date.now() + parsed.expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('iadmin_item_share_tokens').insert({
    liquidation_item_id: parsed.liquidationItemId,
    token,
    expires_at: expiresAt,
    created_by: profile.id,
  })

  if (error) throw new Error(error.message)

  const base = process.env.NEXT_PUBLIC_APP_BASE_URL ?? ''
  const url = `${base}/l/${token}`

  await supabase.from('iadmin_audit_logs').insert({
    administration_id: administrationId,
    actor_profile_id: profile.id,
    entity_type: 'iadmin_liquidation_items',
    entity_id: parsed.liquidationItemId,
    action: 'share_token.created',
    metadata: { expires_at: expiresAt },
  })

  revalidatePath(`/iadmin/liquidaciones/${item.liquidation_run_id}`)

  return { token, url, expiresAt }
}
