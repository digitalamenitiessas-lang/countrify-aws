import { NextRequest, NextResponse } from 'next/server'
import { pgQuery } from '@/lib/db/postgres'
import { generateRemindersCore } from '@/lib/iadmin/generate-reminders-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — corre 1 vez por día, puede tomar varios segundos por administración

/**
 * Endpoint sistémico que dispara generateReminders para cada administración
 * activa. Lo invoca un Lambda + EventBridge schedule (cron diario 12 UTC = 9am ARG).
 *
 * Auth: header `Authorization: Bearer ${CRON_SECRET}` (env var inyectado vía
 * Secrets Manager `countrify/prod/cron-secret`).
 *
 * Response:
 *   200 { ok: true, ranAt, administrations: [{ id, name, created, skipped, error? }] }
 *   401 si bearer mismatch
 *   500 si CRON_SECRET no está configurado
 */
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    console.error('[cron/generate-reminders] CRON_SECRET no está configurado')
    return NextResponse.json({ error: 'cron not configured' }, { status: 500 })
  }

  const auth = req.headers.get('authorization') ?? ''
  const provided = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : ''
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const ranAt = new Date().toISOString()
  console.log(`[cron/generate-reminders] start ${ranAt}`)

  let admins: Array<{ id: string; name: string }>
  try {
    const result = await pgQuery<{ id: string; name: string }>(
      `select id, name from countrify.iadmin_administrations where is_active = true order by name asc`,
    )
    admins = result.rows
  } catch (err) {
    console.error('[cron/generate-reminders] failed listing administrations', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'db error' },
      { status: 500 },
    )
  }

  const results: Array<{
    id: string
    name: string
    created: number
    skipped: number
    error?: string
  }> = []

  for (const admin of admins) {
    try {
      const r = await generateRemindersCore({
        administrationId: admin.id,
        actorProfileId: null,
      })
      results.push({ id: admin.id, name: admin.name, ...r })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron/generate-reminders] admin ${admin.id} failed`, err)
      results.push({ id: admin.id, name: admin.name, created: 0, skipped: 0, error: msg })
    }
  }

  const totalCreated = results.reduce((s, r) => s + r.created, 0)
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0)
  const errors = results.filter((r) => r.error).length
  console.log(
    `[cron/generate-reminders] done admins=${results.length} created=${totalCreated} skipped=${totalSkipped} errors=${errors}`,
  )

  return NextResponse.json({
    ok: true,
    ranAt,
    summary: { administrations: results.length, totalCreated, totalSkipped, errors },
    administrations: results,
  })
}
