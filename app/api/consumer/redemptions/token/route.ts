import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import {
  existsRedemptionForProfilePromotionFromPostgres,
  getBusinessNameFromPostgres,
  getOrCreateRedemptionTokenInPostgres,
  getPromotionForRedemptionFromPostgres,
} from '@/lib/db/business'

export async function POST(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  if (profile.role !== 'vecino' && profile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Solo vecinos pueden solicitar cupones QR.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const promotionId = typeof body?.promotionId === 'string' ? body.promotionId : null
  if (!promotionId) {
    return NextResponse.json({ error: 'Falta promotionId.' }, { status: 400 })
  }

  try {
    const promotion = await getPromotionForRedemptionFromPostgres(promotionId)
    if (!promotion) {
      return NextResponse.json({ error: 'La promocion no existe.' }, { status: 404 })
    }

    const todayStr = new Date().toISOString().slice(0, 10)
    if (
      !promotion.is_active ||
      (promotion.expiration_date && promotion.expiration_date < todayStr)
    ) {
      return NextResponse.json({ error: 'La promocion ya no esta disponible.' }, { status: 400 })
    }

    if (
      promotion.building_id &&
      profile.role !== 'super_admin' &&
      promotion.building_id !== profile.buildingId
    ) {
      return NextResponse.json(
        { error: 'La promocion no esta disponible para tu edificio.' },
        { status: 403 },
      )
    }

    const alreadyUsed = await existsRedemptionForProfilePromotionFromPostgres({
      profileId: profile.id,
      promotionId,
    })
    if (alreadyUsed) {
      return NextResponse.json(
        { error: 'Esta promocion ya fue usada por este vecino.' },
        { status: 409 },
      )
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const token = await getOrCreateRedemptionTokenInPostgres({
      profileId: profile.id,
      promotionId,
      expiresAt,
    })

    const businessName = (await getBusinessNameFromPostgres(promotion.business_id)) ?? 'Comercio'

    return NextResponse.json({
      ok: true,
      token: {
        id: token.id,
        token: token.token,
        qrValue: `CITIFY:${token.token}`,
        expiresAt: token.expires_at,
        promotionId: promotion.id,
        promotionTitle: promotion.title,
        businessName,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error' },
      { status: 500 },
    )
  }
}
