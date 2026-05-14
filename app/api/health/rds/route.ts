import { NextResponse } from 'next/server'
import { isPostgresConfigured, pgQuery } from '@/lib/db/postgres'

export async function GET() {
  if (!isPostgresConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: 'DB_* no esta configurado todavia.',
      },
      { status: 503 },
    )
  }

  try {
    const result = await pgQuery<{ now: string }>('select now()::text as now')
    return NextResponse.json({
      ok: true,
      configured: true,
      now: result.rows[0]?.now ?? null,
    })
  } catch (error) {
    console.error('[RDS] health check failed:', error)
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: error instanceof Error ? error.message : 'No se pudo conectar a RDS.',
      },
      { status: 500 },
    )
  }
}
