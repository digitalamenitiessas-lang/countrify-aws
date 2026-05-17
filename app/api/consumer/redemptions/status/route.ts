import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { getLatestRedemptionForProfilePromotionFromPostgres } from '@/lib/db/business'

export async function GET(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const promotionId = searchParams.get('promotionId')
  if (!promotionId) {
    return NextResponse.json({ error: 'Falta promotionId.' }, { status: 400 })
  }

  try {
    const data = await getLatestRedemptionForProfilePromotionFromPostgres({
      profileId: profile.id,
      promotionId,
    })
    return NextResponse.json({
      ok: true,
      redeemed: Boolean(data?.id),
      redemption: data
        ? {
            id: data.id,
            redeemedAt: data.redeemed_at ?? data.created_at,
          }
        : null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error' },
      { status: 500 },
    )
  }
}
