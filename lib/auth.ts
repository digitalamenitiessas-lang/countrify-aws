import { redirect } from 'next/navigation'
import { findProfileByEmail, findProfileById } from '@/lib/db/profiles'
import { getAppSession } from '@/lib/auth/session'
import type {
  IAdminAdministration,
  IAdminCapability,
  IAdminContext,
  IAdminMembership,
  IAdminOperationalRole,
  Profile,
  UserRole,
} from '@/lib/types'
import { capabilitiesForRole, IADMIN_CAPABILITIES } from '@/lib/iadmin/capabilities'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function mapProfileRow(row: any): Profile {
  return {
    id: row.id,
    email: row.email ?? '',
    fullName: row.full_name ?? 'Usuario',
    role: row.role,
    avatarText: row.avatar_text ?? (row.full_name?.slice(0, 2)?.toUpperCase() || 'U'),
    businessId: row.business_id ?? null,
    buildingId: row.building_id ?? null,
    floor: row.floor ?? null,
    unit: row.unit ?? null,
    phone: row.phone ?? null,
    createdAt: row.created_at,
  }
}

function mapAdministration(row: any): IAdminAdministration {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name ?? null,
    taxId: row.tax_id ?? null,
    contactEmail: row.contact_email ?? null,
    contactPhone: row.contact_phone ?? null,
    isActive: Boolean(row.is_active),
    legalInfo: (row.legal_info ?? {}) as IAdminAdministration['legalInfo'],
    createdAt: row.created_at,
  }
}

export async function getCurrentProfile() {
  const appSession = await getAppSession()
  if (appSession?.provider === 'cognito') {
    const profile = appSession.profileId
      ? await findProfileById(appSession.profileId)
      : await findProfileByEmail(appSession.email)

    if (profile) {
      return profile
    }
  }

  const supabase = await getSupabaseServerClient()
  if (!supabase) {
    return null
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (!data) {
    return null
  }

  return mapProfileRow(data)
}

export async function requireProfile(allowedRoles?: UserRole[]) {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    redirect('/login')
  }

  return { profile }
}

// ----------------------------------------------------------------------------
// IAdmin context: membresias por administracion + capacidades efectivas
// ----------------------------------------------------------------------------

export async function getIAdminContext(profile: Profile): Promise<IAdminContext> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) {
    return { isSuperAdmin: profile.role === 'super_admin', memberships: [], primary: null }
  }

  const isSuperAdmin = profile.role === 'super_admin'

  if (isSuperAdmin) {
    const { data: adminsData } = await supabase
      .from('iadmin_administrations')
      .select('*')
      .eq('is_active', true)
      .order('name')

    const memberships: IAdminMembership[] = (adminsData ?? []).map((row: any, index: number) => ({
      administration: mapAdministration(row),
      operationalRole: 'titular' as IAdminOperationalRole,
      isPrimary: index === 0,
      capabilities: IADMIN_CAPABILITIES.slice(),
    }))

    return {
      isSuperAdmin: true,
      memberships,
      primary: memberships[0] ?? null,
    }
  }

  const { data: grantsData } = await supabase
    .from('iadmin_role_grants')
    .select(`
      operational_role,
      is_primary,
      created_at,
      iadmin_administrations!inner ( * )
    `)
    .eq('profile_id', profile.id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  const adminIds = (grantsData ?? [])
    .map((row: any) => {
      const admin = Array.isArray(row.iadmin_administrations) ? row.iadmin_administrations[0] : row.iadmin_administrations
      return admin?.id as string | undefined
    })
    .filter((id): id is string => Boolean(id))

  const overridesByAdmin = new Map<string, Map<string, boolean>>()
  if (adminIds.length > 0) {
    const { data: overrideRows } = await supabase
      .from('iadmin_role_capabilities')
      .select('administration_id, operational_role, capability_code, granted')
      .in('administration_id', adminIds)

    for (const row of overrideRows ?? []) {
      const key = `${row.administration_id}::${row.operational_role}`
      const map = overridesByAdmin.get(key) ?? new Map<string, boolean>()
      map.set(row.capability_code, Boolean(row.granted))
      overridesByAdmin.set(key, map)
    }
  }

  const memberships: IAdminMembership[] = (grantsData ?? [])
    .map((row: any): IAdminMembership | null => {
      const admin = Array.isArray(row.iadmin_administrations) ? row.iadmin_administrations[0] : row.iadmin_administrations
      if (!admin) return null
      const operationalRole = row.operational_role as string
      const preset = capabilitiesForRole(operationalRole)
      const overrides = overridesByAdmin.get(`${admin.id}::${operationalRole}`) ?? new Map<string, boolean>()

      const capabilities = IADMIN_CAPABILITIES.filter((cap) => {
        if (overrides.has(cap)) {
          return overrides.get(cap) === true
        }
        return preset.includes(cap)
      })

      return {
        administration: mapAdministration(admin),
        operationalRole,
        isPrimary: Boolean(row.is_primary),
        capabilities,
      }
    })
    .filter((item): item is IAdminMembership => item !== null)

  return {
    isSuperAdmin: false,
    memberships,
    primary: memberships[0] ?? null,
  }
}

export async function requireIAdmin(options: {
  capability?: IAdminCapability
  administrationId?: string
} = {}) {
  const { profile } = await requireProfile()

  if (profile.role !== 'super_admin' && profile.role !== 'consorcio_admin') {
    redirect('/login')
  }

  const context = await getIAdminContext(profile)

  if (!context.isSuperAdmin && context.memberships.length === 0) {
    redirect('/login')
  }

  if (options.capability) {
    const allowed = context.isSuperAdmin
      ? true
      : context.memberships.some((membership) => {
          if (options.administrationId && membership.administration.id !== options.administrationId) {
            return false
          }
          return membership.capabilities.includes(options.capability!)
        })

    if (!allowed) {
      redirect('/login')
    }
  }

  return { profile, context }
}

export function can(
  context: IAdminContext,
  capability: IAdminCapability,
  options: { administrationId?: string } = {},
): boolean {
  if (context.isSuperAdmin) {
    return true
  }
  return context.memberships.some((membership) => {
    if (options.administrationId && membership.administration.id !== options.administrationId) {
      return false
    }
    return membership.capabilities.includes(capability)
  })
}

export function findMembership(
  context: IAdminContext,
  administrationId: string,
): IAdminMembership | null {
  return context.memberships.find((m) => m.administration.id === administrationId) ?? null
}
