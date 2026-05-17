'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  getLiquidationItemRunFromPostgres,
  insertShareTokenInPostgres,
  revokeLiveShareTokensInPostgres,
} from '@/lib/db/iadmin-writes'

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

  const item = await getLiquidationItemRunFromPostgres(parsed.liquidationItemId)
  if (!item) throw new Error('Item de liquidacion no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'liquidations.share',
    administrationId: item.administration_id,
  })

  await revokeLiveShareTokensInPostgres(parsed.liquidationItemId)

  const token = randomToken()
  const expiresAt = new Date(Date.now() + parsed.expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  await insertShareTokenInPostgres({
    liquidationItemId: parsed.liquidationItemId,
    token,
    expiresAt,
    createdBy: profile.id,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: item.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_liquidation_items',
    entityId: parsed.liquidationItemId,
    action: 'share_token.created',
    metadata: { expires_at: expiresAt },
  })

  const base = process.env.NEXT_PUBLIC_APP_BASE_URL ?? ''
  const url = `${base}/l/${token}`

  revalidatePath(`/iadmin/liquidaciones/${item.liquidation_run_id}`)

  return { token, url, expiresAt }
}
