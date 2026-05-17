'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth'
import { adminCreateCognitoUser } from '@/lib/aws/cognito'
import { findProfileByEmail, upsertProfile } from '@/lib/db/profiles'
import {
  countActiveAdditionalNeighborsInPostgres,
  findPrincipalMembershipForProfileFromPostgres,
  findUnitProfileMembershipFromPostgres,
  upsertUnitProfileMembershipInPostgres,
} from '@/lib/db/iadmin-writes'

function avatarFromName(fullName: string) {
  return (
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'VN'
  )
}

const householdNeighborSchema = z.object({
  unitId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(40).nullable().optional(),
  password: z.string().min(8).max(72),
})

export async function createHouseholdNeighbor(input: z.input<typeof householdNeighborSchema>) {
  const parsed = householdNeighborSchema.parse(input)
  const { profile } = await requireProfile(['vecino'])

  const principal = await findPrincipalMembershipForProfileFromPostgres({
    unitId: parsed.unitId,
    profileId: profile.id,
  })
  if (!principal) {
    throw new Error('Solo el vecino principal puede agregar familiares a esta unidad.')
  }

  const additionalCount = await countActiveAdditionalNeighborsInPostgres(parsed.unitId)
  if (additionalCount >= 4) {
    throw new Error('La unidad ya tiene 4 vecinos adicionales activos.')
  }

  const normalizedEmail = parsed.email.toLowerCase()
  const existingProfile = await findProfileByEmail(normalizedEmail)

  if (existingProfile) {
    if (existingProfile.role !== 'vecino') {
      throw new Error('Ese email ya pertenece a un usuario que no es vecino.')
    }
    if (existingProfile.buildingId && existingProfile.buildingId !== principal.building_id) {
      throw new Error('Ese email ya pertenece a otro edificio.')
    }
  }

  let profileId = existingProfile?.id
  if (!profileId) {
    const { sub } = await adminCreateCognitoUser({
      email: normalizedEmail,
      password: parsed.password,
      fullName: parsed.fullName,
    })
    profileId = sub
  }

  await upsertProfile({
    id: profileId,
    email: normalizedEmail,
    fullName: parsed.fullName,
    avatarText: avatarFromName(parsed.fullName),
    phone: parsed.phone ?? null,
    role: 'vecino',
    buildingId: principal.building_id,
    businessId: null,
  })

  const existingMembership = await findUnitProfileMembershipFromPostgres({
    unitId: parsed.unitId,
    profileId,
    relationshipType: 'vecino_adicional',
  })

  await upsertUnitProfileMembershipInPostgres({
    membershipId: existingMembership?.id ?? null,
    unitId: parsed.unitId,
    buildingId: principal.building_id,
    profileId,
    relationshipType: 'vecino_adicional',
    isPrimary: false,
    createdByProfileId: profile.id,
  })

  revalidatePath('/usuario')
  return { profileId }
}
