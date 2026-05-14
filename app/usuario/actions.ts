'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function avatarFromName(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'VN'
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
  const supabase = await getSupabaseServerClient()
  if (!supabase) throw new Error('Supabase no configurado')

  const { data: principal } = await supabase
    .from('unit_profile_memberships')
    .select('id, unit_id, building_id')
    .eq('unit_id', parsed.unitId)
    .eq('profile_id', profile.id)
    .eq('relationship_type', 'vecino_principal')
    .eq('active', true)
    .maybeSingle()

  if (!principal) {
    throw new Error('Solo el vecino principal puede agregar familiares a esta unidad.')
  }

  const { count } = await supabase
    .from('unit_profile_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('unit_id', parsed.unitId)
    .eq('relationship_type', 'vecino_adicional')
    .eq('active', true)

  if ((count ?? 0) >= 4) {
    throw new Error('La unidad ya tiene 4 vecinos adicionales activos.')
  }

  const admin = getSupabaseAdminClient()
  if (!admin) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY para crear usuarios desde el panel.')
  }

  const normalizedEmail = parsed.email.toLowerCase()
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, role, building_id')
    .eq('email', normalizedEmail)
    .maybeSingle()

  let profileId = existingProfile?.id as string | undefined
  if (existingProfile) {
    if (existingProfile.role !== 'vecino') {
      throw new Error('Ese email ya pertenece a un usuario que no es vecino.')
    }
    if (existingProfile.building_id && existingProfile.building_id !== principal.building_id) {
      throw new Error('Ese email ya pertenece a otro edificio.')
    }
  }

  if (!profileId) {
    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: parsed.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.fullName },
    })
    if (createError || !createdUser.user) {
      throw new Error(createError?.message ?? 'No se pudo crear el usuario.')
    }
    profileId = createdUser.user.id
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: profileId,
    email: normalizedEmail,
    full_name: parsed.fullName,
    avatar_text: avatarFromName(parsed.fullName),
    phone: parsed.phone ?? null,
    role: 'vecino',
    building_id: principal.building_id,
  })
  if (profileError) throw new Error(profileError.message)

  const { data: existingMembership } = await supabase
    .from('unit_profile_memberships')
    .select('id')
    .eq('unit_id', parsed.unitId)
    .eq('profile_id', profileId)
    .eq('relationship_type', 'vecino_adicional')
    .maybeSingle()

  const membershipPayload = {
    unit_id: parsed.unitId,
    building_id: principal.building_id,
    profile_id: profileId,
    relationship_type: 'vecino_adicional',
    active: true,
    created_by_profile_id: profile.id,
  }

  const { error } = existingMembership
    ? await supabase.from('unit_profile_memberships').update(membershipPayload).eq('id', existingMembership.id)
    : await supabase.from('unit_profile_memberships').insert(membershipPayload)

  if (error) throw new Error(error.message)

  revalidatePath('/usuario')
  return { profileId }
}
