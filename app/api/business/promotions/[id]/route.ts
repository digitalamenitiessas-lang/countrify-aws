import { NextRequest, NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { deletePromotionInPostgres } from '@/lib/db/business'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const profile = await getCurrentProfile()
  if (!profile?.businessId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const { id } = await context.params

  try {
    await deletePromotionInPostgres({ promotionId: id, businessId: profile.businessId })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al borrar' },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true })
}
