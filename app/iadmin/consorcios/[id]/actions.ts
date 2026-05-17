'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import type { UnitProfileRelationship, UserRole } from '@/lib/types'
import { adminCreateCognitoUser } from '@/lib/aws/cognito'
import { findProfileByEmail, upsertProfile } from '@/lib/db/profiles'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  changeAccountingPeriodStatusInPostgres,
  closeActiveHoldersOfKindInPostgres,
  deactivateActivePrincipalMembershipsInPostgres,
  deactivateBuildingInformationInPostgres,
  deactivateMembershipByIdInPostgres,
  deactivateUnitInPostgres,
  endHolderInPostgres,
  findOwnerHolderForProfileFromPostgres,
  findUnitProfileMembershipFromPostgres,
  getAccountingPeriodWithAdminFromPostgres,
  getBuildingIdForPropertyFromPostgres,
  getHolderWithAdminFromPostgres,
  getManagedPropertyAdminIdFromPostgres,
  getMembershipWithAdminFromPostgres,
  getUnitFullScopeFromPostgres,
  getUnitWithAdminFromPostgres,
  insertBuildingInformationInPostgres,
  insertOwnerHolderInPostgres,
  insertUnitFromCrudInPostgres,
  insertUnitHolderFromCrudInPostgres,
  updateManagedPropertyInPostgres,
  updatePropertyLegalInfoInPostgres,
  updateUnitInPostgres,
  upsertAccountingPeriodOpenInPostgres,
  upsertUnitProfileMembershipInPostgres,
} from '@/lib/db/iadmin-writes'

// ----------------------------------------------------------------------------
// Managed property
// ----------------------------------------------------------------------------

const updatePropertySchema = z.object({
  propertyId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(120).nullable().optional(),
  taxId: z.string().trim().max(20).nullable().optional(),
  managementFeePct: z.number().min(0).max(100).nullable().optional(),
  managedSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  propertyKind: z.enum(['consorcio', 'barrio_privado', 'edificio', 'mixto']).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
})

export async function updateManagedProperty(input: z.input<typeof updatePropertySchema>) {
  const parsed = updatePropertySchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'consorcio.edit',
    administrationId: property.administration_id,
  })

  const patch: Parameters<typeof updateManagedPropertyInPostgres>[1] = {}
  if (parsed.displayName !== undefined) patch.display_name = parsed.displayName
  if (parsed.taxId !== undefined) patch.tax_id = parsed.taxId
  if (parsed.managementFeePct !== undefined) patch.management_fee_pct = parsed.managementFeePct
  if (parsed.managedSince !== undefined) patch.managed_since = parsed.managedSince
  if (parsed.propertyKind !== undefined) patch.property_kind = parsed.propertyKind
  if (parsed.notes !== undefined) patch.notes = parsed.notes

  if (Object.keys(patch).length === 0) return

  await updateManagedPropertyInPostgres(parsed.propertyId, patch)

  await insertIAdminAuditLogInPostgres({
    administrationId: property.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_managed_properties',
    entityId: parsed.propertyId,
    action: 'property.updated',
    metadata: patch as Record<string, unknown>,
  })

  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
  revalidatePath('/iadmin/cartera')
}

// ----------------------------------------------------------------------------
// Datos legales
// ----------------------------------------------------------------------------

const legalInfoSchema = z.object({
  bank: z
    .object({
      name: z.string().trim().max(80).optional(),
      cbu: z.string().trim().max(32).optional(),
      alias: z.string().trim().max(40).optional(),
      account: z.string().trim().max(40).optional(),
    })
    .optional(),
  accountantName: z.string().trim().max(120).optional(),
  accountantPhone: z.string().trim().max(40).optional(),
  accountantEmail: z.string().trim().email().max(120).optional().or(z.literal('').transform(() => undefined)),
  insurance: z
    .array(
      z.object({
        company: z.string().trim().max(80).optional(),
        policy: z.string().trim().max(60).optional(),
        coverage: z.string().trim().max(500).optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
      }),
    )
    .max(10)
    .optional(),
  amenities: z
    .array(
      z.object({
        name: z.string().trim().max(80).optional(),
        price: z.string().trim().max(40).optional(),
        deposit: z.string().trim().max(40).optional(),
      }),
    )
    .max(20)
    .optional(),
  collectionSchedule: z.string().trim().max(300).optional(),
  footerNotes: z.string().trim().max(2000).optional(),
})

const updatePropertyLegalSchema = z.object({
  propertyId: z.string().uuid(),
  legalInfo: legalInfoSchema,
})

export async function updatePropertyLegalInfo(input: z.input<typeof updatePropertyLegalSchema>) {
  const parsed = updatePropertyLegalSchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'consorcio.legal.edit',
    administrationId: property.administration_id,
  })

  await updatePropertyLegalInfoInPostgres({
    propertyId: parsed.propertyId,
    legalInfo: parsed.legalInfo as Record<string, unknown>,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: property.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_managed_properties',
    entityId: parsed.propertyId,
    action: 'property.legal_updated',
  })

  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
}

// ----------------------------------------------------------------------------
// Unidades
// ----------------------------------------------------------------------------

const unitFields = z.object({
  code: z.string().trim().min(1).max(30),
  kind: z.enum(['departamento', 'casa', 'local', 'cochera', 'baulera', 'otro']),
  floor: z.string().trim().max(20).nullable().optional(),
  surfaceM2: z.number().nonnegative().nullable().optional(),
  prorataCoefficient: z.number().min(0).max(1).nullable().optional(),
})

const createUnitSchema = unitFields.extend({
  propertyId: z.string().uuid(),
})

export async function createUnit(input: z.input<typeof createUnitSchema>) {
  const parsed = createUnitSchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'units.manage',
    administrationId: property.administration_id,
  })

  const { id } = await insertUnitFromCrudInPostgres({
    managedPropertyId: parsed.propertyId,
    code: parsed.code,
    kind: parsed.kind,
    floor: parsed.floor ?? null,
    surfaceM2: parsed.surfaceM2 ?? null,
    prorataCoefficient: parsed.prorataCoefficient ?? null,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: property.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_units',
    entityId: id,
    action: 'unit.created',
    metadata: { code: parsed.code },
  })

  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
  return { id }
}

const updateUnitSchema = unitFields.partial().extend({
  unitId: z.string().uuid(),
})

export async function updateUnit(input: z.input<typeof updateUnitSchema>) {
  const parsed = updateUnitSchema.parse(input)

  const unit = await getUnitWithAdminFromPostgres(parsed.unitId)
  if (!unit) throw new Error('Unidad no encontrada')

  const { profile } = await requireIAdmin({
    capability: 'units.manage',
    administrationId: unit.administration_id,
  })

  const patch: Parameters<typeof updateUnitInPostgres>[1] = {}
  if (parsed.code !== undefined) patch.code = parsed.code
  if (parsed.kind !== undefined) patch.kind = parsed.kind
  if (parsed.floor !== undefined) patch.floor = parsed.floor
  if (parsed.surfaceM2 !== undefined) patch.surface_m2 = parsed.surfaceM2
  if (parsed.prorataCoefficient !== undefined) patch.prorata_coefficient = parsed.prorataCoefficient
  if (Object.keys(patch).length === 0) return

  await updateUnitInPostgres(parsed.unitId, patch)

  await insertIAdminAuditLogInPostgres({
    administrationId: unit.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_units',
    entityId: parsed.unitId,
    action: 'unit.updated',
    metadata: patch as Record<string, unknown>,
  })

  revalidatePath(`/iadmin/consorcios/${unit.managed_property_id}`)
}

const deactivateUnitSchema = z.object({ unitId: z.string().uuid() })

export async function deactivateUnit(input: z.input<typeof deactivateUnitSchema>) {
  const parsed = deactivateUnitSchema.parse(input)

  const unit = await getUnitWithAdminFromPostgres(parsed.unitId)
  if (!unit) throw new Error('Unidad no encontrada')

  const { profile } = await requireIAdmin({
    capability: 'units.manage',
    administrationId: unit.administration_id,
  })

  await deactivateUnitInPostgres(parsed.unitId)

  await insertIAdminAuditLogInPostgres({
    administrationId: unit.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_units',
    entityId: parsed.unitId,
    action: 'unit.deactivated',
  })

  revalidatePath(`/iadmin/consorcios/${unit.managed_property_id}`)
}

// ----------------------------------------------------------------------------
// Titulares
// ----------------------------------------------------------------------------

const createHolderSchema = z.object({
  unitId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(120),
  holderKind: z.enum(['propietario', 'inquilino', 'apoderado', 'otro']),
  taxId: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().max(120).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  replaceActive: z.boolean().optional().default(false),
})

export async function createUnitHolder(input: z.input<typeof createHolderSchema>) {
  const parsed = createHolderSchema.parse(input)

  const unit = await getUnitWithAdminFromPostgres(parsed.unitId)
  if (!unit) throw new Error('Unidad no encontrada')

  const { profile } = await requireIAdmin({
    capability: 'holders.manage',
    administrationId: unit.administration_id,
  })

  if (parsed.replaceActive) {
    await closeActiveHoldersOfKindInPostgres({
      unitId: parsed.unitId,
      holderKind: parsed.holderKind,
    })
  }

  const { id } = await insertUnitHolderFromCrudInPostgres({
    unitId: parsed.unitId,
    fullName: parsed.fullName,
    holderKind: parsed.holderKind,
    taxId: parsed.taxId ?? null,
    email: parsed.email ?? null,
    phone: parsed.phone ?? null,
    startDate: parsed.startDate ?? null,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: unit.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_unit_holders',
    entityId: id,
    action: 'holder.created',
    metadata: { full_name: parsed.fullName, holder_kind: parsed.holderKind },
  })

  revalidatePath(`/iadmin/consorcios/${unit.managed_property_id}`)
  return { id }
}

const endHolderSchema = z.object({
  holderId: z.string().uuid(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function endUnitHolder(input: z.input<typeof endHolderSchema>) {
  const parsed = endHolderSchema.parse(input)

  const holder = await getHolderWithAdminFromPostgres(parsed.holderId)
  if (!holder) throw new Error('Titular no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'holders.manage',
    administrationId: holder.administration_id,
  })

  await endHolderInPostgres({
    holderId: parsed.holderId,
    endDate: parsed.endDate ?? new Date().toISOString().slice(0, 10),
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: holder.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_unit_holders',
    entityId: parsed.holderId,
    action: 'holder.closed',
  })

  revalidatePath(`/iadmin/consorcios/${holder.managed_property_id}`)
}

// ----------------------------------------------------------------------------
// Usuarios CITIFY vinculados a unidades
// ----------------------------------------------------------------------------

const createUnitUserSchema = z.object({
  unitId: z.string().uuid(),
  relationshipType: z.enum(['propietario', 'vecino_principal', 'vecino_adicional']),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(40).nullable().optional(),
  password: z.string().min(8).max(72),
  isPrimaryOwner: z.boolean().optional().default(false),
})

function roleForRelationship(relationshipType: UnitProfileRelationship): UserRole {
  return relationshipType === 'propietario' ? 'propietario' : 'vecino'
}

function avatarFromName(fullName: string) {
  return (
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'
  )
}

async function ensureProfileForUnit(input: {
  fullName: string
  email: string
  phone: string | null
  password: string
  role: UserRole
  buildingId: string
}): Promise<string> {
  const normalizedEmail = input.email.toLowerCase()
  const existing = await findProfileByEmail(normalizedEmail)

  let profileId = existing?.id
  if (!profileId) {
    const { sub } = await adminCreateCognitoUser({
      email: normalizedEmail,
      password: input.password,
      fullName: input.fullName,
    })
    profileId = sub
  }

  await upsertProfile({
    id: profileId,
    email: normalizedEmail,
    fullName: input.fullName,
    avatarText: avatarFromName(input.fullName),
    role: input.role,
    phone: input.phone,
    buildingId: input.buildingId,
    businessId: null,
  })

  return profileId
}

export async function createUnitUser(input: z.input<typeof createUnitUserSchema>) {
  const parsed = createUnitUserSchema.parse(input)

  const scope = await getUnitFullScopeFromPostgres(parsed.unitId)
  if (!scope) throw new Error('Unidad no encontrada')

  const { profile } = await requireIAdmin({
    capability: 'holders.manage',
    administrationId: scope.administrationId,
  })

  const role = roleForRelationship(parsed.relationshipType)
  const targetProfileId = await ensureProfileForUnit({
    fullName: parsed.fullName,
    email: parsed.email,
    phone: parsed.phone ?? null,
    password: parsed.password,
    role,
    buildingId: scope.buildingId,
  })

  if (parsed.relationshipType === 'vecino_principal') {
    await deactivateActivePrincipalMembershipsInPostgres(scope.unitId)
  }

  const existingMembership = await findUnitProfileMembershipFromPostgres({
    unitId: scope.unitId,
    profileId: targetProfileId,
    relationshipType: parsed.relationshipType,
  })

  await upsertUnitProfileMembershipInPostgres({
    membershipId: existingMembership?.id ?? null,
    unitId: scope.unitId,
    buildingId: scope.buildingId,
    profileId: targetProfileId,
    relationshipType: parsed.relationshipType,
    isPrimary: parsed.relationshipType === 'propietario' ? parsed.isPrimaryOwner : false,
    createdByProfileId: profile.id,
  })

  if (parsed.relationshipType === 'propietario') {
    const existingHolder = await findOwnerHolderForProfileFromPostgres({
      unitId: scope.unitId,
      profileId: targetProfileId,
    })
    if (!existingHolder) {
      await insertOwnerHolderInPostgres({
        unitId: scope.unitId,
        profileId: targetProfileId,
        fullName: parsed.fullName,
        email: parsed.email.toLowerCase(),
        phone: parsed.phone ?? null,
      })
    }
  }

  await insertIAdminAuditLogInPostgres({
    administrationId: scope.administrationId,
    actorProfileId: profile.id,
    entityType: 'unit_profile_memberships',
    entityId: scope.unitId,
    action: 'unit_user.created',
    metadata: {
      unit_code: scope.unitCode,
      profile_id: targetProfileId,
      relationship_type: parsed.relationshipType,
    },
  })

  revalidatePath(`/iadmin/consorcios/${scope.managedPropertyId}`)
  return { profileId: targetProfileId }
}

const deactivateUnitMembershipSchema = z.object({
  membershipId: z.string().uuid(),
})

export async function deactivateUnitMembership(input: z.input<typeof deactivateUnitMembershipSchema>) {
  const parsed = deactivateUnitMembershipSchema.parse(input)

  const membership = await getMembershipWithAdminFromPostgres(parsed.membershipId)
  if (!membership) throw new Error('Vinculo no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'holders.manage',
    administrationId: membership.administration_id,
  })

  await deactivateMembershipByIdInPostgres(parsed.membershipId)

  await insertIAdminAuditLogInPostgres({
    administrationId: membership.administration_id,
    actorProfileId: profile.id,
    entityType: 'unit_profile_memberships',
    entityId: parsed.membershipId,
    action: 'unit_user.deactivated',
  })

  revalidatePath(`/iadmin/consorcios/${membership.managed_property_id}`)
}

// ----------------------------------------------------------------------------
// Informacion del edificio
// ----------------------------------------------------------------------------

const buildingInfoSchema = z.object({
  propertyId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  content: z.string().trim().min(2).max(2000),
  visibleTo: z.enum(['residentes', 'vecinos', 'propietarios']).default('residentes'),
  sortOrder: z.number().int().min(0).max(999).default(0),
})

export async function createBuildingInformation(input: z.input<typeof buildingInfoSchema>) {
  const parsed = buildingInfoSchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'consorcio.edit',
    administrationId: property.administration_id,
  })

  const buildingId = await getBuildingIdForPropertyFromPostgres(parsed.propertyId)
  if (!buildingId) throw new Error('Edificio no encontrado')

  await insertBuildingInformationInPostgres({
    buildingId,
    title: parsed.title,
    category: parsed.category,
    content: parsed.content,
    visibleTo: parsed.visibleTo,
    sortOrder: parsed.sortOrder,
    createdByProfileId: profile.id,
  })

  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
  revalidatePath('/usuario')
  revalidatePath('/propietario')
}

const deactivateBuildingInfoSchema = z.object({
  propertyId: z.string().uuid(),
  itemId: z.string().uuid(),
})

export async function deactivateBuildingInformation(
  input: z.input<typeof deactivateBuildingInfoSchema>,
) {
  const parsed = deactivateBuildingInfoSchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'consorcio.edit',
    administrationId: property.administration_id,
  })

  await deactivateBuildingInformationInPostgres({
    itemId: parsed.itemId,
    updatedByProfileId: profile.id,
  })

  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
  revalidatePath('/usuario')
  revalidatePath('/propietario')
}

// ----------------------------------------------------------------------------
// Periodos contables
// ----------------------------------------------------------------------------

const openPeriodSchema = z.object({
  propertyId: z.string().uuid(),
  periodYear: z.number().int().min(2020).max(2100),
  periodMonth: z.number().int().min(1).max(12),
})

export async function openAccountingPeriod(input: z.input<typeof openPeriodSchema>) {
  const parsed = openPeriodSchema.parse(input)

  const property = await getManagedPropertyAdminIdFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'liquidations.create',
    administrationId: property.administration_id,
  })

  const { id } = await upsertAccountingPeriodOpenInPostgres({
    managedPropertyId: parsed.propertyId,
    periodYear: parsed.periodYear,
    periodMonth: parsed.periodMonth,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: property.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_accounting_periods',
    entityId: id,
    action: 'period.opened',
    metadata: { period_year: parsed.periodYear, period_month: parsed.periodMonth },
  })

  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
  return { id }
}

const changePeriodStatusSchema = z.object({
  periodId: z.string().uuid(),
  nextStatus: z.enum(['open', 'locked', 'closed']),
})

export async function changePeriodStatus(input: z.input<typeof changePeriodStatusSchema>) {
  const parsed = changePeriodStatusSchema.parse(input)

  const period = await getAccountingPeriodWithAdminFromPostgres(parsed.periodId)
  if (!period) throw new Error('Periodo no encontrado')

  const { profile } = await requireIAdmin({
    capability: parsed.nextStatus === 'closed' ? 'liquidations.close' : 'liquidations.create',
    administrationId: period.administration_id,
  })

  await changeAccountingPeriodStatusInPostgres({
    periodId: parsed.periodId,
    nextStatus: parsed.nextStatus,
    closedByProfileId: parsed.nextStatus === 'closed' ? profile.id : null,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: period.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_accounting_periods',
    entityId: parsed.periodId,
    action: `period.${parsed.nextStatus}`,
  })

  revalidatePath(`/iadmin/consorcios/${period.managed_property_id}`)
}
