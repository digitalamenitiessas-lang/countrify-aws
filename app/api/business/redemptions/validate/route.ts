import { NextRequest, NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import {
  findRedemptionTokenByCodeFromPostgres,
  getProfileFullNameFromPostgres,
  getPromotionForRedemptionFromPostgres,
  insertPromotionRedemptionInPostgres,
  markTokenRedeemedInPostgres,
} from '@/lib/db/business'

type ValidateBody = {
  rawToken?: string
}

type ValidateResult = {
  status:
    | 'forbidden'
    | 'not_found'
    | 'expired'
    | 'already_used'
    | 'promotion_unavailable'
    | 'success'
  message: string
  tokenId: string | null
  promotionId: string | null
  promotionTitle: string | null
  neighborName: string | null
  redeemedAt: string | null
}

function ok(result: ValidateResult) {
  return NextResponse.json({ ok: true, result })
}

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile?.businessId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  if (profile.role !== 'negocio_admin' && profile.role !== 'super_admin') {
    return ok({
      status: 'forbidden',
      message: 'Solo el negocio puede validar canjes.',
      tokenId: null,
      promotionId: null,
      promotionTitle: null,
      neighborName: null,
      redeemedAt: null,
    })
  }

  let body: ValidateBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload invalido.' }, { status: 400 })
  }

  const rawToken = body.rawToken?.trim()
  if (!rawToken) {
    return NextResponse.json({ error: 'Ingresa el codigo del cupon.' }, { status: 400 })
  }

  let normalized = rawToken.toUpperCase()
  if (normalized.startsWith('CITIFY:')) {
    normalized = normalized.slice('CITIFY:'.length)
  }

  const token = await findRedemptionTokenByCodeFromPostgres(normalized)
  if (!token) {
    return ok({
      status: 'not_found',
      message: 'No encontramos ese codigo.',
      tokenId: null,
      promotionId: null,
      promotionTitle: null,
      neighborName: null,
      redeemedAt: null,
    })
  }

  const promotion = await getPromotionForRedemptionFromPostgres(token.promotion_id)
  const neighborName = (await getProfileFullNameFromPostgres(token.profile_id)) ?? 'Vecino'

  if (
    profile.role === 'negocio_admin' &&
    promotion &&
    promotion.business_id !== profile.businessId
  ) {
    return ok({
      status: 'forbidden',
      message: 'Ese codigo pertenece a otro negocio.',
      tokenId: token.id,
      promotionId: token.promotion_id,
      promotionTitle: promotion.title,
      neighborName,
      redeemedAt: token.redeemed_at,
    })
  }

  // Token redimido o ya hay redemption del vecino para esta promo → already_used
  const alreadyHasRedemption = await (async () => {
    const { existsRedemptionForProfilePromotionFromPostgres } = await import('@/lib/db/business')
    return existsRedemptionForProfilePromotionFromPostgres({
      profileId: token.profile_id,
      promotionId: token.promotion_id,
    })
  })()

  if (alreadyHasRedemption || token.status === 'redeemed') {
    await markTokenRedeemedInPostgres({
      tokenId: token.id,
      redeemedByBusinessId: promotion?.business_id ?? null,
    })
    return ok({
      status: 'already_used',
      message: 'Esta promocion ya habia sido canjeada por este vecino.',
      tokenId: token.id,
      promotionId: token.promotion_id,
      promotionTitle: promotion?.title ?? null,
      neighborName,
      redeemedAt: token.redeemed_at ?? new Date().toISOString(),
    })
  }

  const tokenExpired = token.status !== 'pending' || new Date(token.expires_at).getTime() <= Date.now()
  if (tokenExpired) {
    if (token.status === 'pending') {
      await markTokenRedeemedInPostgres({ tokenId: token.id, redeemedByBusinessId: null })
    }
    return ok({
      status: 'expired',
      message: 'El codigo expiro. Pidele al vecino que vuelva a abrir el QR.',
      tokenId: token.id,
      promotionId: token.promotion_id,
      promotionTitle: promotion?.title ?? null,
      neighborName,
      redeemedAt: null,
    })
  }

  if (
    !promotion ||
    !promotion.is_active ||
    (promotion.expiration_date && promotion.expiration_date < new Date().toISOString().slice(0, 10))
  ) {
    return ok({
      status: 'promotion_unavailable',
      message: 'La promocion ya no esta disponible para canje.',
      tokenId: token.id,
      promotionId: token.promotion_id,
      promotionTitle: promotion?.title ?? null,
      neighborName,
      redeemedAt: null,
    })
  }

  const inserted = await insertPromotionRedemptionInPostgres({
    profileId: token.profile_id,
    promotionId: token.promotion_id,
  })

  await markTokenRedeemedInPostgres({
    tokenId: token.id,
    redeemedByBusinessId: promotion.business_id,
  })

  if (!inserted.id) {
    return ok({
      status: 'already_used',
      message: 'Esta promocion ya habia sido canjeada por este vecino.',
      tokenId: token.id,
      promotionId: token.promotion_id,
      promotionTitle: promotion.title,
      neighborName,
      redeemedAt: token.redeemed_at ?? new Date().toISOString(),
    })
  }

  return ok({
    status: 'success',
    message: '¡Canje confirmado!',
    tokenId: token.id,
    promotionId: token.promotion_id,
    promotionTitle: promotion.title,
    neighborName,
    redeemedAt: new Date().toISOString(),
  })
}
