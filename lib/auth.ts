import { redirect } from 'next/navigation'
import {
  getIAdminAdministrationsFromPostgres,
  getIAdminRoleCapabilityOverridesFromPostgres,
  getIAdminRoleGrantsForProfileFromPostgres,
} from '@/lib/db/iadmin-core'
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

export async function getCurrentProfile(): Promise<Profile | null> {
  const appSession = await getAppSession()
  if (appSession?.provider !== 'cognito') return null

  const profile = appSession.profileId
    ? await findProfileById(appSession.profileId)
    : await findProfileByEmail(appSession.email)

  return profile ?? null
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
  const isSuperAdmin = profile.role === 'super_admin'

  if (isSuperAdmin) {
    const adminsData = await getIAdminAdministrationsFromPostgres(true)
    const memberships: IAdminMembership[] = adminsData.map((row, index) => ({
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

  const grantsData = await getIAdminRoleGrantsForProfileFromPostgres(profile.id)
  const adminIds = grantsData.map((row) => row.administration_id)
  const overrideRows = adminIds.length > 0
    ? await getIAdminRoleCapabilityOverridesFromPostgres(adminIds)
    : []

  const overridesByAdmin = new Map<string, Map<string, boolean>>()
  for (const row of overrideRows) {
    const key = `${row.administration_id}::${row.operational_role}`
    const map = overridesByAdmin.get(key) ?? new Map<string, boolean>()
    map.set(row.capability_code, Boolean(row.granted))
    overridesByAdmin.set(key, map)
  }

  const memberships: IAdminMembership[] = grantsData.map((row) => {
    const preset = capabilitiesForRole(row.operational_role)
    const overrides = overridesByAdmin.get(`${row.administration_id}::${row.operational_role}`) ?? new Map<string, boolean>()
    const capabilities = IADMIN_CAPABILITIES.filter((cap) => {
      if (overrides.has(cap)) {
        return overrides.get(cap) === true
      }
      return preset.includes(cap)
    })

    return {
      administration: mapAdministration({
        id: row.admin_id,
        name: row.admin_name,
        legal_name: row.admin_legal_name,
        tax_id: row.admin_tax_id,
        contact_email: row.admin_contact_email,
        contact_phone: row.admin_contact_phone,
        is_active: row.admin_is_active,
        legal_info: row.admin_legal_info,
        created_at: row.admin_created_at,
      }),
      operationalRole: row.operational_role,
      isPrimary: Boolean(row.is_primary),
      capabilities,
    }
  })

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
