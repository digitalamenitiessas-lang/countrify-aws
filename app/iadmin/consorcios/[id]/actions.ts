'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import type { UnitProfileRelationship, UserRole } from '@/lib/types'
import { findProfileById } from '@/lib/db/profiles'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import { ensureUnitUserWithCredentials } from '@/lib/iadmin/unit-users'
import { sendWelcomeEmail } from '@/lib/email/notifications/welcome'
import {
  closeActiveHoldersOfKindInPostgres,
  deactivateActivePrincipalMembershipsInPostgres,
  deactivateBuildingInformationInPostgres,
  deactivateMembershipByIdInPostgres,
  deactivateUnitInPostgres,
  endHolderInPostgres,
  findUnitProfileMembershipFromPostgres,
  getBuildingIdForPropertyFromPostgres,
  getHolderForAccessFromPostgres,
  getHolderWithAdminFromPostgres,
  getManagedPropertyAdminIdFromPostgres,
  getManagedPropertyOperationalSettingsFromPostgres,
  getMembershipWithAdminFromPostgres,
  getUnitFullScopeFromPostgres,
  getUnitWithAdminFromPostgres,
  insertBuildingInformationInPostgres,
  insertUnitFromCrudInPostgres,
  insertUnitHolderFromCrudInPostgres,
  updateManagedPropertyInPostgres,
  updateManagedPropertyOperationalSettingsInPostgres,
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

const operationalSettingsSchema = z.object({
  dueDateRules: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        day: z.number().int().min(1).max(28),
        surchargePct: z.number().min(0).max(100),
      }),
    )
    .min(1)
    .max(3)
    .optional(),
  paymentAllocationMode: z.enum(['fifo_oldest_first']).optional(),
  closePeriodPolicy: z.enum(['issued_required']).optional(),
  allowManualAdjustments: z.boolean().optional(),
  legalDebtNotice: z.string().trim().max(2000).optional(),
})

const updateOperationalSettingsSchema = z.object({
  propertyId: z.string().uuid(),
  operationalSettings: operationalSettingsSchema,
})

export async function updatePropertyOperationalSettings(
  input: z.input<typeof updateOperationalSettingsSchema>,
) {
  const parsed = updateOperationalSettingsSchema.parse(input)

  const property = await getManagedPropertyOperationalSettingsFromPostgres(parsed.propertyId)
  if (!property) throw new Error('Consorcio no encontrado')

  const { profile } = await requireIAdmin({
    capability: 'admin.settings.manage',
    administrationId: property.administration_id,
  })

  const nextSettings = {
    paymentAllocationMode: 'fifo_oldest_first',
    closePeriodPolicy: 'issued_required',
    allowManualAdjustments: false,
    ...(property.operational_settings ?? {}),
    ...(parsed.operationalSettings ?? {}),
  }

  await updateManagedPropertyOperationalSettingsInPostgres({
    propertyId: parsed.propertyId,
    operationalSettings: nextSettings,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: property.administration_id,
    actorProfileId: profile.id,
    entityType: 'iadmin_managed_properties',
    entityId: parsed.propertyId,
    action: 'property.operational_settings_updated',
    metadata: nextSettings,
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
  relationshipType: z.enum(['vecino_principal', 'vecino_adicional']),
  // Vínculo legal del contacto que se crea junto con el usuario. Se pide
  // explícitamente (no se asume propietario). Sólo se usa si hay que crear un
  // holder nuevo; si ya existe un contacto con ese email, se linkea y se respeta
  // su vínculo actual.
  holderKind: z.enum(['propietario', 'inquilino', 'apoderado', 'otro']),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(40).nullable().optional(),
  password: z.string().min(8).max(72),
  isPrimaryOwner: z.boolean().optional().default(false),
})

export async function createUnitUser(input: z.input<typeof createUnitUserSchema>) {
  const parsed = createUnitUserSchema.parse(input)

  const scope = await getUnitFullScopeFromPostgres(parsed.unitId)
  if (!scope) throw new Error('Unidad no encontrada')

  const { profile } = await requireIAdmin({
    capability: 'holders.manage',
    administrationId: scope.administrationId,
  })

  const result = await ensureUnitUserWithCredentials({
    scope: {
      unitId: scope.unitId,
      unitCode: scope.unitCode,
      buildingId: scope.buildingId,
      administrationId: scope.administrationId,
    },
    fullName: parsed.fullName,
    email: parsed.email,
    phone: parsed.phone ?? null,
    relationshipType: parsed.relationshipType,
    actorProfileId: profile.id,
    password: parsed.password,
    via: 'individual',
    holderKind: parsed.holderKind,
  })

  // Mail de bienvenida con credenciales (best-effort; sólo si se creó el perfil).
  void sendWelcomeEmail({
    profileId: result.profileId,
    reason: 'neighbor_added',
    temporaryPassword: result.temporaryPassword ?? undefined,
  })

  revalidatePath(`/iadmin/consorcios/${scope.managedPropertyId}`)
  return { profileId: result.profileId }
}

// Crea el acceso (login) para un contacto YA existente. Toma nombre+email del
// holder (no se re-piden) y linkea el perfil al holder vía profile_id. El
// vínculo legal queda como está en el contacto (acá no se pregunta nada). El eje
// "responsable de pago" se elige con isResponsableDePago → relationship_type.
const createAccessForHolderSchema = z.object({
  holderId: z.string().uuid(),
  isResponsableDePago: z.boolean().optional().default(false),
})

export async function createAccessForHolder(
  input: z.input<typeof createAccessForHolderSchema>,
) {
  const parsed = createAccessForHolderSchema.parse(input)

  const holder = await getHolderForAccessFromPostgres(parsed.holderId)
  if (!holder) throw new Error('Contacto no encontrado')
  if (!holder.is_active) throw new Error('El contacto no está activo')
  if (holder.profile_id) throw new Error('Este contacto ya tiene un usuario asociado')

  const email = holder.email?.trim()
  if (!email) {
    throw new Error('Agregá un email al contacto antes de crear su acceso')
  }
  if (holder.full_name.trim().length < 2) {
    throw new Error('El contacto necesita un nombre válido para crear el acceso')
  }

  const { profile } = await requireIAdmin({
    capability: 'holders.manage',
    administrationId: holder.administration_id,
  })

  const result = await ensureUnitUserWithCredentials({
    scope: {
      unitId: holder.unit_id,
      unitCode: holder.unit_code,
      buildingId: holder.building_id,
      administrationId: holder.administration_id,
    },
    fullName: holder.full_name,
    email,
    phone: holder.phone,
    relationshipType: parsed.isResponsableDePago ? 'vecino_principal' : 'vecino_adicional',
    actorProfileId: profile.id,
    via: 'from_holder',
    holderId: holder.id,
  })

  void sendWelcomeEmail({
    profileId: result.profileId,
    reason: 'neighbor_added',
    temporaryPassword: result.temporaryPassword ?? undefined,
  })

  revalidatePath(`/iadmin/consorcios/${holder.managed_property_id}`)
  return { profileId: result.profileId }
}

const linkExistingProfileSchema = z.object({
  unitId: z.string().uuid(),
  profileId: z.string().uuid(),
  relationshipType: z.enum(['vecino_principal', 'vecino_adicional']),
  isPrimaryOwner: z.boolean().optional().default(false),
})

export async function linkExistingProfileToUnit(input: z.input<typeof linkExistingProfileSchema>) {
  const parsed = linkExistingProfileSchema.parse(input)

  const scope = await getUnitFullScopeFromPostgres(parsed.unitId)
  if (!scope) throw new Error('Unidad no encontrada')

  const { profile: actor } = await requireIAdmin({
    capability: 'holders.manage',
    administrationId: scope.administrationId,
  })

  const target = await findProfileById(parsed.profileId)
  if (!target) throw new Error('Vecino no encontrado')
  if (target.buildingId !== scope.buildingId) {
    throw new Error('El vecino no pertenece a este consorcio')
  }

  if (parsed.relationshipType === 'vecino_principal') {
    await deactivateActivePrincipalMembershipsInPostgres(scope.unitId)
  }

  const existing = await findUnitProfileMembershipFromPostgres({
    unitId: scope.unitId,
    profileId: parsed.profileId,
    relationshipType: parsed.relationshipType,
  })

  await upsertUnitProfileMembershipInPostgres({
    membershipId: existing?.id ?? null,
    unitId: scope.unitId,
    buildingId: scope.buildingId,
    profileId: parsed.profileId,
    relationshipType: parsed.relationshipType,
    isPrimary: false,
    createdByProfileId: actor.id,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: scope.administrationId,
    actorProfileId: actor.id,
    entityType: 'unit_profile_memberships',
    entityId: scope.unitId,
    action: 'unit_user.linked_existing',
    metadata: {
      unit_code: scope.unitCode,
      profile_id: parsed.profileId,
      relationship_type: parsed.relationshipType,
    },
  })

  revalidatePath(`/iadmin/consorcios/${scope.managedPropertyId}`)
  return { profileId: parsed.profileId }
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

