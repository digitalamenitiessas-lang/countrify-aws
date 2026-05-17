import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { toggleSavedPromotionInPostgres } from '@/lib/db/business'

export async function POST(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const promotionId = typeof body?.promotionId === 'string' ? body.promotionId : null
  if (!promotionId) {
    return NextResponse.json({ error: 'Falta promotionId.' }, { status: 400 })
  }

  try {
    const result = await toggleSavedPromotionInPostgres({
      profileId: profile.id,
      promotionId,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error' },
      { status: 500 },
    )
  }
}
