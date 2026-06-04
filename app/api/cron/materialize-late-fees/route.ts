import { NextResponse } from 'next/server'
import { pgQuery } from '@/lib/db/postgres'
import { materializeLateFeesForAdministrationInPostgres } from '@/lib/db/iadmin-writes'

// Endpoint disparado por EventBridge/cron externo (diario, idealmente al
// amanecer). Recorre todas las administraciones activas y materializa los
// recargos por mora vencidos según las `due_dates` de cada run emitido.
// Es idempotente: vuelve a llamarlo no genera duplicados (el materializer
// compara `targetAmount - existingAssessed`).
//
// Auth via header X-Cron-Secret (compartido con el scheduler). Mismo
// patrón que /api/cron/generate-reminders.
//
// Esta rutina cubre el caso en que nadie entró a las pantallas que ya
// disparan materialización on-demand (Inicio, Mesa, Cobranzas). Garantiza
// que mails automáticos, exports y consumers externos vean valores frescos.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    )
  }
  const provided = request.headers.get('x-cron-secret')
  if (provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const adminsRes = await pgQuery<{ id: string }>(
    `select id from public.iadmin_administrations where is_active = true`,
  )

  const today = new Date().toISOString().slice(0, 10)
  const results: Array<{ administrationId: string; ok: boolean; error?: string }> = []
  let totalOk = 0
  let totalFailed = 0

  for (const a of adminsRes.rows) {
    try {
      await materializeLateFeesForAdministrationInPostgres({
        administrationId: a.id,
        asOfDate: today,
        actorProfileId: null,
      })
      results.push({ administrationId: a.id, ok: true })
      totalOk += 1
    } catch (err) {
      totalFailed += 1
      results.push({
        administrationId: a.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({
    ok: true,
    administrations: adminsRes.rows.length,
    asOfDate: today,
    totals: { processed: totalOk, failed: totalFailed },
    elapsedMs: Date.now() - started,
    results,
  })
}

export async function GET() {
  return NextResponse.json(
    { error: 'method not allowed, use POST with X-Cron-Secret header' },
    { status: 405 },
  )
}
