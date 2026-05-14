import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'

export async function GET() {
  const profile = await getCurrentProfile()

  if (!profile) {
    return NextResponse.json({ authenticated: false, profile: null })
  }

  return NextResponse.json({
    authenticated: true,
    profile: {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      role: profile.role,
      businessId: profile.businessId,
      buildingId: profile.buildingId,
    },
  })
}
