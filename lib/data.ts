import { CATEGORIES } from '@/lib/constants'
import type {
  Building,
  BuildingAdminAssignment,
  BuildingInformationItem,
  Business,
  BusinessDashboardData,
  ComplaintCaseDetailConsorcioView,
  ComplaintCaseDetailNeighborView,
  ComplaintCaseEvent,
  ComplaintCaseListItem,
  ComplaintCaseMentionableUser,
  ComplaintCaseMessageView,
  ComplaintCaseMessageMention,
  ComplaintCaseSummaryByBuilding,
  ComplaintCaseSummaryByReason,
  ComplaintReason,
  ComplaintCaseReasonSelection,
  ConsorcioAdminInfo,
  ConsorcioDashboardData,
  ConsorcioManagedBuilding,
  ConsumerDashboardData,
  HomeData,
  IAdminAdministration,
  IAdminAccountingPeriod,
  IAdminAIExtraction,
  IAdminConsorcioDetail,
  IAdminExpenseDocument,
  IAdminExpenseStatus,
  IAdminExpenseSummary,
  IAdminLiquidationRunSummary,
  IAdminCashAccount,
  IAdminCashAccountWithBalance,
  IAdminCashMovement,
  IAdminCashStatement,
  IAdminClosingChecklist,
  IAdminClosingStep,
  IAdminClosingStepId,
  IAdminConsorcioDashboard,
  IAdminDashboardCashSnapshot,
  IAdminDueDate,
  IAdminExpenseLineInRun,
  IAdminLegalInfo,
  IAdminLiquidationStatus,
  IAdminPropertyKind,
  IAdminUnitKind,
  IAdminHolderKind,
  IAdminPeriodStatus,
  IAdminLiquidationItem,
  IAdminLiquidationItemDueAmount,
  IAdminLiquidationRunDetail,
  IAdminManagedProperty,
  IAdminMesaState,
  IAdminMesaUnitLine,
  IAdminMonthlyGrid,
  IAdminMonthlyGridRow,
  IAdminUnitAccountMonth,
  IAdminUnitAccountStatement,
  IAdminUnitPaymentReceipt,
  IAdminPayment,
  IAdminReminder,
  IAdminReminderStatus,
  IAdminPeriodCollections,
  IAdminAccountPayable,
  IAdminOverdueBucket,
  IAdminPortfolio,
  IAdminPortfolioOverview,
  IAdminPortfolioPropertyRow,
  IAdminProvider,
  IAdminUnit,
  IAdminUnitHolder,
  IAdminUnitWithHolders,
  MarketplaceItem,
  OwnerDashboardData,
  OwnerUnitSummary,
  Profile,
  Promotion,
  PromotionMonthlyStatus,
  PromotionRedemptionHistoryItem,
  PromotionRedemptionByBuilding,
  PromotionsPageData,
  SuperAdminBuildingDetail,
  SuperAdminBusinessDetail,
  SuperAdminConsorcioAdminOption,
  SuperAdminDashboardData,
  SuperAdminPromotionDetail,
  UnitProfileMembership,
} from '@/lib/types'
import { buildPublicS3Url } from '@/lib/aws/s3'
import {
  countActiveUnitHoldersByPropertyFromPostgres,
  getBuildingInformationByBuildingIdsFromPostgres,
  getConsorcioAdminMentionablesByBuildingIdsFromPostgres,
  getConsorcioAssignmentsForProfileFromPostgres,
  getConsorcioBuildingsByIdsFromPostgres,
  getConsorcioComplaintCasesByBuildingIdsFromPostgres,
  getConsorcioNeighborsByBuildingIdsFromPostgres,
  getIAdminAdministrationByIdFromPostgres,
  getIAdminAccountingPeriodForPropertyMonthFromPostgres,
  getIAdminExpensesInboxFromPostgres,
  getIAdminManagedPropertiesByAdministrationFromPostgres,
  getIAdminManagedPropertyByIdFromPostgres,
  getIAdminPortfolioOverviewRowsFromPostgres,
  getIAdminPortfolioStatsFromPostgres,
  getIAdminProvidersFromPostgres,
  getIAdminRecentExpensesByPropertyFromPostgres,
  getIAdminUnitsByPropertyFromPostgres,
  getOwnerLiquidationItemsByUnitIdsFromPostgres,
  getOwnerPaymentsByUnitIdsFromPostgres,
  getUnitProfileMembershipsForProfileFromPostgres,
} from '@/lib/db/iadmin-core'
import {
  getExpenseDetailRowFromPostgres,
  getExpensePaymentInfoFromPostgres,
  listCashAccountsWithBalanceFromPostgres,
  listCashMovementsFromPostgres,
  countActiveRecurringProvidersFromPostgres,
  countActiveUnitsByPropertyFromPostgres,
  countExpensesForPeriodFromPostgres,
  countNotificationsSinceForAdminFromPostgres,
  countPendingDocsForPropertyFromPostgres,
  countRemindersGeneratedSinceFromPostgres,
  getRunIdAndStatusForPeriodFromPostgres,
  getLiquidationRunHeaderFromPostgres,
  getManagedPropertyFullFromPostgres,
  getRunForPeriodFromPostgres,
  listActiveProvidersForGridFromPostgres,
  listActiveUnitsProrataFromPostgres,
  listExpensesForGridFromPostgres,
  listRunsForGridFromPostgres,
  getUnitWithAdminAndHolderFromPostgres,
  getMostRecentIssuedPriorRunItemsFromPostgres,
  listAccountingPeriodsByYearsFromPostgres,
  listActiveUnitsWithProrataAndHolderFromPostgres,
  listDashboardItemsByRunsFromPostgres,
  listDashboardRunsFromPostgres,
  listExpenseDocumentsWithExtractionFromPostgres,
  listExpensesForDashboardFromPostgres,
  listHoldersByUnitsFromPostgres,
  listImputedExpenseLinesByPeriodFromPostgres,
  listLiquidationItemsByRunBasicFromPostgres,
  listLiquidationItemsDetailedFromPostgres,
  listLiquidationRunSummariesByAdminFromPostgres,
  listLivePaymentsByRunDetailedFromPostgres,
  listMembershipsWithProfileByUnitsFromPostgres,
  listPaidExpenseIdsFromPostgres,
  listRemindersWithContextFromPostgres,
  listRunsWithUnitItemFromPostgres,
  listUnitPaymentsInWindowFromPostgres,
  listUnitsBasicByPropertyFromPostgres,
  sumImputedExpensesByPeriodsFromPostgres,
  sumImputedTotalsForPeriodFromPostgres,
  sumLivePaymentsByUnitForItemsFromPostgres,
  sumLivePaymentsForRunFromPostgres,
  type RunForMesaItemRow,
  type RunForMesaRow,
} from '@/lib/db/iadmin-reads'
import {
  getAccountingPeriodIdAndStatusFromPostgres,
  getManagedPropertyAdminIdFromPostgres,
  listProfileNamesByIdsFromPostgres,
  sumLivePaymentsByItemIdsFromPostgres,
} from '@/lib/db/iadmin-writes'
import {
  countVecinoProfilesFromPostgres,
  listAllBuildingsFromPostgres,
  listAllBusinessesFromPostgres,
  listAllProfilesFromPostgres,
  listAllPromotionsForSuperadminFromPostgres,
  listAllRedemptionsByBuildingFromPostgres,
  listBuildingAdminAssignmentsFromPostgres,
  listRedemptionsForBusinessFromPostgres,
  listSuperadminManagedPropertiesFromPostgres,
} from '@/lib/db/superadmin'
import {
  getBuildingFullByIdFromPostgres,
  listBuildingInformationForBuildingFromPostgres,
  listComplaintReasonsFromPostgres,
  listFullMembershipsForProfileFromPostgres,
  listHouseholdMembershipsForUnitFromPostgres,
  listMarketplaceItemsForBuildingFromPostgres,
  listMentionablesForBuildingFromPostgres,
  listNeighborComplaintCasesFromPostgres,
  listSavedPromotionIdsForProfileFromPostgres,
  listUsedPromotionIdsForProfileFromPostgres,
} from '@/lib/db/consumer'
import { findProfileById } from '@/lib/db/profiles'
import { getAllBusinessesFromPostgres, getBusinessByIdFromPostgres } from '@/lib/db/businesses'
import { getPublicPromotionsFromPostgres } from '@/lib/db/public-home'
import { getPromotionsForBusinessFromPostgres, type PromotionRow } from '@/lib/db/promotions'
import { isPostgresConfigured } from '@/lib/db/postgres'

function publicUrl(client: any, bucket: string, path: string | null | undefined) {
  if (!path) {
    return null
  }

  const s3BaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL?.replace(/\/+$/, '')
  if (s3BaseUrl && path.startsWith('public/')) {
    return `${s3BaseUrl}/${path}`
  }

  if (!client) {
    return null
  }

  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

function mapBuilding(row: any): Building {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    latitude: row.latitude ? Number(row.latitude) : null,
    longitude: row.longitude ? Number(row.longitude) : null,
    totalUnits: row.total_units ?? 0,
    createdAt: row.created_at,
  }
}

function mapBuildingAssignment(row: any): BuildingAdminAssignment {
  return {
    id: row.id,
    profileId: row.profile_id,
    buildingId: row.building_id,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at,
  }
}

function mapProfile(row: any): Profile {
  return {
    id: row.id,
    email: row.email ?? '',
    fullName: row.full_name ?? 'Usuario',
    role: row.role,
    avatarText: row.avatar_text ?? 'U',
    businessId: row.business_id ?? null,
    buildingId: row.building_id ?? null,
    floor: row.floor ?? null,
    unit: row.unit ?? null,
    phone: row.phone ?? null,
    createdAt: row.created_at,
  }
}

function mapBuildingInformation(row: any): BuildingInformationItem {
  return {
    id: row.id,
    buildingId: row.building_id,
    title: row.title,
    category: row.category ?? 'general',
    content: row.content,
    visibleTo: row.visible_to ?? 'residentes',
    sortOrder: row.sort_order ?? 0,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  }
}

function mapUnitProfileMembership(row: any): UnitProfileMembership {
  const unit = Array.isArray(row.iadmin_units) ? row.iadmin_units[0] : row.iadmin_units
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  const managedProperty = unit?.iadmin_managed_properties
    ? Array.isArray(unit.iadmin_managed_properties)
      ? unit.iadmin_managed_properties[0]
      : unit.iadmin_managed_properties
    : null
  const building = managedProperty?.buildings
    ? Array.isArray(managedProperty.buildings)
      ? managedProperty.buildings[0]
      : managedProperty.buildings
    : null

  return {
    id: row.id,
    unitId: row.unit_id,
    buildingId: row.building_id,
    profileId: row.profile_id,
    relationshipType: row.relationship_type,
    isPrimary: Boolean(row.is_primary),
    active: Boolean(row.active),
    createdByProfileId: row.created_by_profile_id ?? null,
    createdAt: row.created_at,
    unitCode: unit?.code ?? null,
    unitFloor: unit?.floor ?? null,
    buildingName: building?.name ?? null,
    profile: profile ? mapProfile(profile) : null,
  }
}

function mapBusiness(client: any, row: any): Business {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? '',
    address: row.address ?? null,
    latitude: row.latitude ? Number(row.latitude) : null,
    longitude: row.longitude ? Number(row.longitude) : null,
    ownerProfileId: row.owner_profile_id ?? null,
    logoPath: row.logo_path ?? null,
    logoUrl: publicUrl(client, 'business-logos', row.logo_path),
    createdAt: row.created_at,
  }
}

function mapPromotion(client: any, row: any): Promotion {
  const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses
  const redemptions = Array.isArray(row.promotion_redemptions) ? row.promotion_redemptions : []
  return {
    id: row.id,
    businessId: row.business_id,
    businessName: business?.name ?? 'Comercio',
    title: row.title,
    description: row.description,
    discount: row.discount,
    category: row.category,
    expirationDate: row.expiration_date,
    usageCount: redemptions.length,
    buildingId: row.building_id ?? null,
    createdAt: row.created_at,
    publishedMonth: row.published_month ?? row.created_at?.slice(0, 7) + '-01',
    sourcePromotionId: row.source_promotion_id ?? null,
    imagePath: row.image_path ?? null,
    imageUrl: publicUrl(client, 'promotion-images', row.image_path),
    isActive: Boolean(row.is_active),
  }
}

function getMonthStart(input = new Date()) {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

function getPreviousMonthStart(monthStart: string) {
  const date = new Date(`${monthStart}T00:00:00.000Z`)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
}

function getMonthEnd(monthStart: string) {
  const date = new Date(`${monthStart}T00:00:00.000Z`)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
}

function formatMonthLabel(monthStart: string) {
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${monthStart}T00:00:00.000Z`))
}

function buildAutoRenewedPromotion(promotion: Promotion, referenceMonthStart: string): Promotion {
  const monthEnd = getMonthEnd(referenceMonthStart)
  return {
    ...promotion,
    publishedMonth: referenceMonthStart,
    expirationDate: promotion.expirationDate > monthEnd ? promotion.expirationDate : monthEnd,
    sourcePromotionId: promotion.sourcePromotionId ?? promotion.id,
  }
}

function mapPromotionFromPostgresRow(row: Awaited<ReturnType<typeof getPublicPromotionsFromPostgres>>[number]): Promotion {
  const publishedMonth = row.published_month ?? `${row.created_at.slice(0, 7)}-01`

  return {
    id: row.id,
    businessId: row.business_id,
    businessName: row.business_name || 'Comercio',
    title: row.title,
    description: row.description,
    discount: row.discount,
    category: row.category,
    expirationDate: row.expiration_date,
    usageCount: Number(row.usage_count ?? 0),
    buildingId: row.building_id ?? null,
    createdAt: row.created_at,
    publishedMonth,
    sourcePromotionId: row.source_promotion_id ?? null,
    imagePath: row.image_path ?? null,
    imageUrl: row.image_path?.startsWith('public/') ? buildPublicS3Url(row.image_path) : null,
    isActive: Boolean(row.is_active),
  }
}

function mapBusinessFromPostgresRow(row: Awaited<ReturnType<typeof getBusinessByIdFromPostgres>>): Business | null {
  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? '',
    address: null,
    latitude: null,
    longitude: null,
    ownerProfileId: row.owner_profile_id ?? null,
    logoPath: row.logo_path ?? null,
    logoUrl: row.logo_path?.startsWith('public/') ? buildPublicS3Url(row.logo_path) : null,
    createdAt: row.created_at,
  }
}

function mapPromotionFromBusinessPostgresRow(row: PromotionRow): Promotion {
  const publishedMonth = row.published_month ?? `${row.created_at.slice(0, 7)}-01`

  return {
    id: row.id,
    businessId: row.business_id,
    businessName: row.business_name || 'Comercio',
    title: row.title,
    description: row.description,
    discount: row.discount,
    category: row.category,
    expirationDate: row.expiration_date,
    usageCount: Number(row.usage_count ?? 0),
    buildingId: row.building_id ?? null,
    createdAt: row.created_at,
    publishedMonth,
    sourcePromotionId: row.source_promotion_id ?? null,
    imagePath: row.image_path ?? null,
    imageUrl: row.image_path?.startsWith('public/') ? buildPublicS3Url(row.image_path) : null,
    isActive: Boolean(row.is_active),
  }
}

function applyPromotionAutoRenewal(promotions: Promotion[], referenceMonthStart = getMonthStart()): Promotion[] {
  const currentByBusiness = new Set(
    promotions.filter((promotion) => promotion.publishedMonth === referenceMonthStart).map((promotion) => promotion.businessId),
  )

  const latestActiveByBusiness = new Map<string, Promotion>()
  for (const promotion of [...promotions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!promotion.isActive || currentByBusiness.has(promotion.businessId) || latestActiveByBusiness.has(promotion.businessId)) continue
    latestActiveByBusiness.set(promotion.businessId, promotion)
  }

  if (latestActiveByBusiness.size === 0) {
    return promotions
  }

  return promotions.map((promotion) => {
    const fallbackPromotion = latestActiveByBusiness.get(promotion.businessId)
    if (!fallbackPromotion || fallbackPromotion.id !== promotion.id) {
      return promotion
    }
    return buildAutoRenewedPromotion(promotion, referenceMonthStart)
  })
}

function buildPromotionMonthlyStatus(promotions: Promotion[], referenceMonthStart = getMonthStart()): PromotionMonthlyStatus {
  const effectivePromotions = applyPromotionAutoRenewal(promotions, referenceMonthStart)
  const previousMonthStart = getPreviousMonthStart(referenceMonthStart)
  const promotionsThisMonth = effectivePromotions.filter((promotion) => promotion.publishedMonth === referenceMonthStart)
  const lastMonthPromotion =
    [...effectivePromotions]
      .filter((promotion) => promotion.publishedMonth === previousMonthStart)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  const autoRenewedPromotion =
    promotionsThisMonth.find((promotion) => {
      const original = promotions.find((item) => item.id === promotion.id)
      return original ? original.publishedMonth !== referenceMonthStart : false
    }) ?? null

  return {
    monthStart: referenceMonthStart,
    monthLabel: formatMonthLabel(referenceMonthStart),
    isCompliant: promotionsThisMonth.length > 0,
    promotionsThisMonth: promotionsThisMonth.length,
    lastMonthPromotion,
    isAutoRenewed: Boolean(autoRenewedPromotion),
    autoRenewedPromotion,
  }
}

function mapMarketplaceItem(client: any, row: any): MarketplaceItem {
  const seller = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    price: Number(row.price ?? 0),
    condition: row.condition,
    sellerId: row.seller_profile_id,
    sellerName: seller?.full_name ?? 'Vecino',
    sellerAvatar: seller?.avatar_text ?? 'VN',
    sellerPhone: seller?.phone ?? null,
    buildingId: row.building_id,
    createdAt: row.created_at,
    imagePath: row.image_path ?? null,
    imageUrl: publicUrl(client, 'marketplace-images', row.image_path),
    isActive: Boolean(row.is_active),
  }
}

function mapComplaintReason(row: any): ComplaintReason {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    description: row.description ?? null,
    isOther: Boolean(row.is_other),
    createdAt: row.created_at,
  }
}

function normalizeReasonRows(rows: any[] | null | undefined): ComplaintCaseReasonSelection[] {
  return (rows ?? [])
    .map((row: any) => (row?.complaint_reason_catalog ? row.complaint_reason_catalog : row))
    .filter(Boolean)
    .map((row: any) => ({
      id: row.id,
      slug: row.slug,
      label: row.label,
      isOther: Boolean(row.is_other),
    }))
}

function profileUnitLabel(row: any): string | null {
  return [row?.floor, row?.unit].filter(Boolean).join(' - ') || null
}

function mapPromotionRedemptionHistoryItem(row: any): PromotionRedemptionHistoryItem {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  const promotion = Array.isArray(row.promotions) ? row.promotions[0] : row.promotions
  const building = profile?.buildings ? (Array.isArray(profile.buildings) ? profile.buildings[0] : profile.buildings) : null

  return {
    id: row.id,
    promotionId: row.promotion_id,
    promotionTitle: promotion?.title ?? 'Promocion',
    promotionDiscount: promotion?.discount ?? null,
    profileId: row.profile_id,
    neighborName: profile?.full_name ?? 'Vecino',
    neighborUnitLabel: profileUnitLabel(profile),
    buildingName: building?.name ?? null,
    status: row.status ?? 'redeemed',
    redeemedAt: row.redeemed_at ?? row.created_at,
    createdAt: row.created_at,
  }
}

function buildMentionLabel(row: any): string {
  const fullName = row?.full_name ?? 'Usuario'
  if (row?.role === 'consorcio_admin') {
    return `Consorcio · ${fullName}`
  }
  const unitLabel = profileUnitLabel(row)
  return unitLabel ? `${fullName} (${unitLabel})` : fullName
}

function mapMentionableUser(row: any, buildingId: string): ComplaintCaseMentionableUser {
  return {
    profileId: row.id,
    fullName: row.full_name ?? 'Usuario',
    role: row.role,
    unitLabel: profileUnitLabel(row),
    buildingId,
    label: buildMentionLabel(row),
  }
}

function mapComplaintMessageMention(row: any): ComplaintCaseMessageMention {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  return {
    id: row.id,
    messageId: row.message_id,
    mentionedProfileId: row.mentioned_profile_id,
    label: row.label ?? buildMentionLabel(profile),
  }
}

function mapComplaintMessage(row: any): ComplaintCaseMessageView {
  return {
    id: row.id,
    caseId: row.case_id,
    message: row.message,
    messageType: row.message_type,
    authorLabel: row.author_label ?? 'Sistema',
    authorRole: row.author_role ?? 'sistema',
    mentions: (row.complaint_case_message_mentions ?? row.mentions ?? []).map(mapComplaintMessageMention),
    createdAt: row.created_at,
  }
}

function mapComplaintEvent(row: any): ComplaintCaseEvent {
  return {
    id: row.id,
    caseId: row.case_id,
    eventType: row.event_type,
    actorLabel: row.actor_label ?? 'Sistema',
    actorRole: row.actor_role ?? 'sistema',
    summary: row.summary,
    metadata: row.metadata ?? null,
    createdAt: row.created_at,
  }
}

function buildComplaintCaseListItem(detail: ComplaintCaseDetailNeighborView | ComplaintCaseDetailConsorcioView): ComplaintCaseListItem {
  const lastEvent = [...detail.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return {
    id: detail.id,
    caseCode: detail.caseCode,
    buildingId: detail.buildingId,
    buildingName: detail.buildingName,
    title: detail.title,
    status: detail.status,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    lastEventAt: lastEvent?.createdAt ?? detail.updatedAt,
    lastEventSummary: lastEvent?.summary ?? null,
    reasons: detail.reasons,
    otherReasonText: detail.otherReasonText,
    messageCount: detail.messages.length,
    eventCount: detail.events.length,
    canReply: detail.canReply,
    canChangeStatus: detail.canChangeStatus,
  }
}

function buildComplaintSummaryByBuilding(buildingId: string, buildingName: string, details: ComplaintCaseDetailConsorcioView[]): ComplaintCaseSummaryByBuilding {
  return {
    buildingId,
    buildingName,
    total: details.length,
    nuevo: details.filter((item) => item.status === 'nuevo').length,
    enRevision: details.filter((item) => item.status === 'en_revision').length,
    enDesarrollo: details.filter((item) => item.status === 'en_desarrollo').length,
    enEspera: details.filter((item) => item.status === 'en_espera').length,
    resuelto: details.filter((item) => item.status === 'resuelto').length,
    cerrado: details.filter((item) => item.status === 'cerrado').length,
  }
}

function buildComplaintReasonSummary(details: Array<ComplaintCaseDetailNeighborView | ComplaintCaseDetailConsorcioView>): ComplaintCaseSummaryByReason[] {
  const counts = new Map<string, ComplaintCaseSummaryByReason>()
  for (const detail of details) {
    for (const reason of detail.reasons) {
      const current = counts.get(reason.id) ?? { reasonId: reason.id, reasonLabel: reason.label, count: 0 }
      current.count += 1
      counts.set(reason.id, current)
    }
  }

  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.reasonLabel.localeCompare(b.reasonLabel))
}

function mapNeighborComplaintCaseDetail(row: any, mentionableUsers: ComplaintCaseMentionableUser[]): ComplaintCaseDetailNeighborView {
  return {
    id: row.id,
    caseCode: row.case_code,
    buildingId: row.building_id,
    buildingName: row.building_name ?? 'Edificio',
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? null,
    closedAt: row.closed_at ?? null,
    otherReasonText: row.other_reason_text ?? null,
    reasons: normalizeReasonRows(row.reasons),
    messages: (row.messages ?? []).map(mapComplaintMessage),
    events: (row.events ?? []).map(mapComplaintEvent),
    mentionableUsers,
    canReply: Boolean(row.can_reply),
    canChangeStatus: Boolean(row.can_change_status),
    defaultSection: 'summary',
  }
}

function mapConsorcioComplaintCaseDetail(row: any, mentionableUsers: ComplaintCaseMentionableUser[]): ComplaintCaseDetailConsorcioView {
  const building = Array.isArray(row.buildings) ? row.buildings[0] : row.buildings
  const author = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  const messages = (row.complaint_case_messages ?? []).map((message: any) => {
    const messageAuthor = Array.isArray(message.profiles) ? message.profiles[0] : message.profiles
    const role = messageAuthor?.role === 'consorcio_admin' ? 'consorcio' : messageAuthor?.role === 'super_admin' ? 'super_admin' : 'vecino'
    return mapComplaintMessage({
      ...message,
      author_label: role === 'vecino' ? messageAuthor?.full_name ?? 'Vecino' : role === 'consorcio' ? 'Consorcio' : 'Super admin',
      author_role: role,
    })
  })

  return {
    id: row.id,
    caseCode: row.case_code,
    buildingId: row.building_id,
    buildingName: building?.name ?? 'Edificio',
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? null,
    closedAt: row.closed_at ?? null,
    otherReasonText: row.other_reason_text ?? null,
    reasons: normalizeReasonRows(row.complaint_case_reasons),
    messages,
    events: (row.complaint_case_events ?? []).map(mapComplaintEvent),
    mentionableUsers,
    canReply: row.status !== 'cerrado',
    canChangeStatus: true,
    defaultSection: 'summary',
    author: {
      profileId: author?.id ?? row.author_profile_id,
      fullName: author?.full_name ?? 'Vecino',
      email: author?.email ?? '',
      avatarText: author?.avatar_text ?? 'VN',
      unitLabel: profileUnitLabel(author),
    },
  }
}

export async function getHomeData(): Promise<HomeData> {
  // En build time o si la DB no está configurada (p.ej. SSG prerender),
  // devolvemos vacío en lugar de tirar.
  if (!isPostgresConfigured()) {
    return { promotions: [] }
  }
  try {
    const promotions = applyPromotionAutoRenewal(
      (await getPublicPromotionsFromPostgres(12)).map(mapPromotionFromPostgresRow),
    )
    return {
      promotions: promotions.slice(0, 12),
    }
  } catch (error) {
    console.error('[getHomeData] error leyendo de RDS:', error)
    return { promotions: [] }
  }
}

export async function getPromotionsPageData(): Promise<PromotionsPageData> {
  return getHomeData()
}

export async function getBusinessDashboardData(profileId: string): Promise<BusinessDashboardData> {
  const profile = await findProfileById(profileId)
  const businessId = profile?.businessId ?? null

  if (!businessId) {
    const [consumersCount, buildingsData] = await Promise.all([
      countVecinoProfilesFromPostgres(),
      listAllBuildingsFromPostgres(),
    ])
    return {
      business: null,
      promotions: [],
      consumersCount,
      availableBuildings: buildingsData.map(mapBuilding),
      monthlyStatus: null,
      redemptionHistory: [],
    }
  }

  const [consumersCount, buildingsData, redemptionsRaw, businessRow, promotionRows] = await Promise.all([
    countVecinoProfilesFromPostgres(),
    listAllBuildingsFromPostgres(),
    listRedemptionsForBusinessFromPostgres(businessId),
    getBusinessByIdFromPostgres(businessId),
    getPromotionsForBusinessFromPostgres(businessId),
  ])

  const rawPromotions = promotionRows.map(mapPromotionFromBusinessPostgresRow)
  const promotions = applyPromotionAutoRenewal(rawPromotions)
  const business = mapBusinessFromPostgresRow(businessRow)

  return {
    business,
    promotions,
    consumersCount,
    availableBuildings: buildingsData.map(mapBuilding),
    monthlyStatus: business ? buildPromotionMonthlyStatus(rawPromotions) : null,
    redemptionHistory: redemptionsRaw.map((row) => mapPromotionRedemptionHistoryItem({
      id: row.id,
      profile_id: row.profile_id,
      promotion_id: row.promotion_id,
      status: row.status,
      redeemed_at: row.redeemed_at,
      created_at: row.created_at,
      profiles: {
        id: row.profile_id,
        full_name: row.profile_full_name,
        floor: row.profile_floor,
        unit: row.profile_unit,
        buildings: row.profile_building_id ? {
          id: row.profile_building_id,
          name: row.profile_building_name,
        } : null,
      },
      promotions: {
        id: row.promotion_id,
        title: row.promotion_title,
        discount: row.promotion_discount,
      },
    })),
  }
}

export async function getConsorcioDashboardData(profileId: string): Promise<ConsorcioDashboardData> {
  const assignmentsRows = await getConsorcioAssignmentsForProfileFromPostgres(profileId)
  const assignments = assignmentsRows.map(mapBuildingAssignment)
  const buildingIds = assignments.map((assignment) => assignment.buildingId)

  if (buildingIds.length === 0) {
    return {
      managedBuildings: [],
      assignments,
      primaryBuildingId: null,
      totalBuildings: 0,
      totalUnits: 0,
      totalNeighbors: 0,
      averageOccupancyRate: 0,
      totalComplaintCases: 0,
      complaintSummaries: [],
      complaintReasonSummaries: [],
    }
  }

  const [buildingsRows, neighborsRows, adminMentionRows, complaintCaseRows] = await Promise.all([
    getConsorcioBuildingsByIdsFromPostgres(buildingIds),
    getConsorcioNeighborsByBuildingIdsFromPostgres(buildingIds),
    getConsorcioAdminMentionablesByBuildingIdsFromPostgres(buildingIds),
    getConsorcioComplaintCasesByBuildingIdsFromPostgres(buildingIds),
  ])

  const neighborsByBuilding = new Map<string, Profile[]>()
  for (const row of neighborsRows) {
    const mapped = mapProfile(row)
    if (!mapped.buildingId) continue
    const current = neighborsByBuilding.get(mapped.buildingId) ?? []
    current.push(mapped)
    neighborsByBuilding.set(mapped.buildingId, current)
  }

  const adminProfilesByBuilding = new Map<string, ComplaintCaseMentionableUser[]>()
  for (const row of adminMentionRows) {
    const profile = row.profile
    if (!profile?.id || !row.building_id) continue
    const current = adminProfilesByBuilding.get(row.building_id) ?? []
    if (!current.some((item) => item.profileId === profile.id)) {
      current.push(mapMentionableUser(profile, row.building_id))
    }
    adminProfilesByBuilding.set(row.building_id, current)
  }

  const caseDetailsByBuilding = new Map<string, ComplaintCaseDetailConsorcioView[]>()
  for (const row of complaintCaseRows) {
    const buildingId = row.building_id
    const mentionableUsers = [
      ...(neighborsByBuilding.get(buildingId) ?? []).map((neighbor) =>
        mapMentionableUser(
          {
            id: neighbor.id,
            full_name: neighbor.fullName,
            role: neighbor.role,
            floor: neighbor.floor,
            unit: neighbor.unit,
          },
          buildingId,
        ),
      ),
      ...(adminProfilesByBuilding.get(buildingId) ?? []),
    ].sort((a, b) => a.label.localeCompare(b.label))
    const detail = mapConsorcioComplaintCaseDetail(row, mentionableUsers)
    const current = caseDetailsByBuilding.get(detail.buildingId) ?? []
    current.push(detail)
    caseDetailsByBuilding.set(detail.buildingId, current)
  }

  const buildingsById = new Map(buildingsRows.map((row: any) => [row.id, mapBuilding(row)]))
  const managedBuildings: ConsorcioManagedBuilding[] = assignments
    .map((assignment) => {
      const building = buildingsById.get(assignment.buildingId)
      if (!building) return null
      const neighbors = neighborsByBuilding.get(building.id) ?? []
      const complaintCaseDetails = (caseDetailsByBuilding.get(building.id) ?? []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      const complaintCases = complaintCaseDetails.map(buildComplaintCaseListItem)
      const complaintMentionableUsers = [
        ...neighbors.map((neighbor) =>
          mapMentionableUser(
            {
              id: neighbor.id,
              full_name: neighbor.fullName,
              role: neighbor.role,
              floor: neighbor.floor,
              unit: neighbor.unit,
            },
            building.id,
          ),
        ),
        ...(adminProfilesByBuilding.get(building.id) ?? []),
      ]
        .filter((user, index, array) => array.findIndex((item) => item.profileId === user.profileId) === index)
        .sort((a, b) => a.label.localeCompare(b.label))

      return {
        building,
        neighbors,
        registeredNeighbors: neighbors.length,
        occupancyRate: Math.round((neighbors.length / Math.max(building.totalUnits, 1)) * 100),
        complaintMentionableUsers,
        complaintCases,
        complaintCaseDetails,
        complaintSummary: buildComplaintSummaryByBuilding(building.id, building.name, complaintCaseDetails),
        reasonSummary: buildComplaintReasonSummary(complaintCaseDetails),
      }
    })
    .filter((item): item is ConsorcioManagedBuilding => Boolean(item))

  const totalUnits = managedBuildings.reduce((sum, item) => sum + item.building.totalUnits, 0)
  const totalNeighbors = managedBuildings.reduce((sum, item) => sum + item.registeredNeighbors, 0)
  const averageOccupancyRate = managedBuildings.length
    ? Math.round(managedBuildings.reduce((sum, item) => sum + item.occupancyRate, 0) / managedBuildings.length)
    : 0
  const complaintSummaries = managedBuildings.map((item) => item.complaintSummary)
  const complaintReasonSummaries = buildComplaintReasonSummary(managedBuildings.flatMap((item) => item.complaintCaseDetails))

  return {
    managedBuildings,
    assignments,
    primaryBuildingId: assignments.find((assignment) => assignment.isPrimary)?.buildingId ?? managedBuildings[0]?.building.id ?? null,
    totalBuildings: managedBuildings.length,
    totalUnits,
    totalNeighbors,
    averageOccupancyRate,
    totalComplaintCases: managedBuildings.reduce((sum, item) => sum + item.complaintCases.length, 0),
    complaintSummaries,
    complaintReasonSummaries,
  }
}

export async function getSuperAdminDashboardData(): Promise<SuperAdminDashboardData> {
  const [buildingsRows, usersRows, businessesRows, assignmentsRows, propertiesRows, promotionsRows, redemptionsRows] = await Promise.all([
    listAllBuildingsFromPostgres(),
    listAllProfilesFromPostgres(),
    listAllBusinessesFromPostgres(),
    listBuildingAdminAssignmentsFromPostgres(),
    listSuperadminManagedPropertiesFromPostgres(),
    listAllPromotionsForSuperadminFromPostgres(),
    listAllRedemptionsByBuildingFromPostgres(),
  ])

  const buildingsRes = { data: buildingsRows }
  const usersRes = { data: usersRows }
  const businessesRes = { data: businessesRows }
  const assignmentsRes = { data: assignmentsRows }
  const propertiesRes = { data: propertiesRows }

  const allBuildings = (buildingsRes.data ?? []).map(mapBuilding)
  const allUsers = (usersRes.data ?? []).map(mapProfile)
  const allPromotionsRaw = promotionsRows.map((row): Promotion => ({
    id: row.id,
    businessId: row.business_id,
    businessName: row.business_name ?? '',
    title: row.title,
    description: row.description,
    discount: row.discount,
    category: row.category ?? '',
    expirationDate: row.expiration_date ?? '',
    buildingId: row.building_id,
    imagePath: row.image_path,
    imageUrl: row.image_path?.startsWith('public/') ? buildPublicS3Url(row.image_path) : null,
    isActive: Boolean(row.is_active),
    usageCount: row.redemption_count,
    createdAt: row.created_at,
    publishedMonth: row.published_month ?? `${row.created_at.slice(0, 7)}-01`,
    sourcePromotionId: row.source_promotion_id,
  }))
  const allPromotionsEffective = applyPromotionAutoRenewal(allPromotionsRaw)
  const buildingNameById = new Map(allBuildings.map((building) => [building.id, building.name]))
  const userEmailById = new Map(allUsers.map((user) => [user.id, user.email]))

  const adminsByBuilding = new Map<string, ConsorcioAdminInfo[]>()
  for (const row of assignmentsRes.data ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    if (!profile) continue
    const info: ConsorcioAdminInfo = {
      profileId: profile.id,
      fullName: profile.full_name ?? 'Sin nombre',
      email: profile.email ?? '',
      phone: profile.phone ?? null,
      isPrimary: Boolean(row.is_primary),
    }
    const existing = adminsByBuilding.get(row.building_id) ?? []
    existing.push(info)
    adminsByBuilding.set(row.building_id, existing)
  }

  const neighborsByBuilding = new Map<string, Profile[]>()
  for (const user of allUsers) {
    if (user.role !== 'vecino' || !user.buildingId) continue
    const existing = neighborsByBuilding.get(user.buildingId) ?? []
    existing.push(user)
    neighborsByBuilding.set(user.buildingId, existing)
  }

  const redemptionMap = new Map<string, Map<string, { name: string; count: number }>>()
  for (const row of redemptionsRows) {
    if (!row.building_id) continue
    if (!redemptionMap.has(row.promotion_id)) redemptionMap.set(row.promotion_id, new Map())
    const byBuilding = redemptionMap.get(row.promotion_id)!
    const current = byBuilding.get(row.building_id) ?? { name: row.building_name ?? '', count: 0 }
    current.count += 1
    byBuilding.set(row.building_id, current)
  }

  const allPromotions: SuperAdminPromotionDetail[] = allPromotionsEffective.map((promotion) => {
    const byBuilding = redemptionMap.get(promotion.id)
    const redemptionsByBuilding: PromotionRedemptionByBuilding[] = byBuilding
      ? Array.from(byBuilding.entries())
          .map(([buildingId, { name, count }]) => ({ buildingId, buildingName: name, count }))
          .sort((a, b) => b.count - a.count)
      : []
    return { ...promotion, redemptionsByBuilding }
  })

  const propertyByBuilding = new Map<
    string,
    {
      administration: IAdminAdministration | null
      managedProperty: IAdminManagedProperty
    }
  >()

  for (const row of propertiesRes.data ?? []) {
    if (!row.building_id || propertyByBuilding.has(row.building_id)) continue
    const administration = row.iadmin_administrations
      ? mapAdministration(Array.isArray(row.iadmin_administrations) ? row.iadmin_administrations[0] : row.iadmin_administrations)
      : null

    propertyByBuilding.set(row.building_id, {
      administration,
      managedProperty: mapManagedProperty(row),
    })
  }

  const buildings: SuperAdminBuildingDetail[] = allBuildings.map((building) => {
    const neighbors = neighborsByBuilding.get(building.id) ?? []
    const admins = adminsByBuilding.get(building.id) ?? []
    const occupancyRate = Math.round((neighbors.length / Math.max(building.totalUnits, 1)) * 100)
    const managedContext = propertyByBuilding.get(building.id)
    return {
      ...building,
      admins,
      neighbors,
      registeredNeighbors: neighbors.length,
      occupancyRate,
      administration: managedContext?.administration ?? null,
      managedProperty: managedContext?.managedProperty ?? null,
    }
  })

  const adminAssignmentSummary = new Map<
    string,
    {
      assignedBuildingNames: string[]
      primaryBuildingName: string | null
    }
  >()

  for (const row of assignmentsRes.data ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    if (!profile?.id) continue

    const current = adminAssignmentSummary.get(profile.id) ?? {
      assignedBuildingNames: [],
      primaryBuildingName: null,
    }
    const buildingName = buildingNameById.get(row.building_id)
    if (buildingName && !current.assignedBuildingNames.includes(buildingName)) {
      current.assignedBuildingNames.push(buildingName)
    }
    if (row.is_primary && buildingName) {
      current.primaryBuildingName = buildingName
    }
    adminAssignmentSummary.set(profile.id, current)
  }

  const consorcioAdminOptions: SuperAdminConsorcioAdminOption[] = allUsers
    .filter((user) => user.role === 'consorcio_admin')
    .map((user) => {
      const summary = adminAssignmentSummary.get(user.id)
      return {
        profileId: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        assignedBuildingsCount: summary?.assignedBuildingNames.length ?? 0,
        primaryBuildingName: summary?.primaryBuildingName ?? null,
        assignedBuildingNames: summary?.assignedBuildingNames ?? [],
      }
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))

  const businessPromoMap = new Map<string, SuperAdminPromotionDetail[]>()
  for (const promotion of allPromotions) {
    const existing = businessPromoMap.get(promotion.businessId) ?? []
    existing.push(promotion)
    businessPromoMap.set(promotion.businessId, existing)
  }

  const businessPromoRawMap = new Map<string, Promotion[]>()
  for (const promotion of allPromotionsRaw) {
    const existing = businessPromoRawMap.get(promotion.businessId) ?? []
    existing.push(promotion)
    businessPromoRawMap.set(promotion.businessId, existing)
  }

  const businesses: SuperAdminBusinessDetail[] = (businessesRes.data ?? [])
    .map((row: any) => mapBusinessFromPostgresRow(row))
    .filter((business): business is Business => Boolean(business))
    .map((business) => {
    const promotions = businessPromoMap.get(business.id) ?? []
    const totalRedemptions = promotions.reduce((sum, p) => sum + p.usageCount, 0)
    const buildingCounts = new Map<string, { name: string; count: number }>()
    for (const promotion of promotions) {
      for (const { buildingId, buildingName, count } of promotion.redemptionsByBuilding) {
        const existing = buildingCounts.get(buildingId) ?? { name: buildingName, count: 0 }
        existing.count += count
        buildingCounts.set(buildingId, existing)
      }
    }
    const topEntry = Array.from(buildingCounts.values()).sort((a, b) => b.count - a.count)[0]
    return {
      ...business,
      ownerEmail: business.ownerProfileId ? userEmailById.get(business.ownerProfileId) ?? null : null,
      promotions,
      totalRedemptions,
      topBuilding: topEntry?.name ?? null,
      monthlyStatus: buildPromotionMonthlyStatus(businessPromoRawMap.get(business.id) ?? []),
    }
  })

  return {
    buildings,
    users: allUsers,
    businesses,
    promotions: allPromotions,
    consorcioAdminOptions,
  }
}

function membershipRowToNested(row: import('@/lib/db/consumer').MembershipFullRow) {
  return {
    id: row.id,
    unit_id: row.unit_id,
    building_id: row.building_id,
    profile_id: row.profile_id,
    relationship_type: row.relationship_type,
    is_primary: row.is_primary,
    active: row.active,
    created_at: row.created_at,
    created_by_profile_id: row.created_by_profile_id,
    profiles: {
      id: row.profile_id,
      email: row.profile_email,
      full_name: row.profile_full_name,
      role: row.profile_role,
      floor: row.profile_floor,
      unit: row.profile_unit,
    },
    iadmin_units: row.unit_id
      ? {
          id: row.unit_id,
          code: row.unit_code,
          floor: row.unit_floor,
          iadmin_managed_properties: {
            buildings: row.building_name
              ? { id: row.building_id, name: row.building_name }
              : null,
          },
        }
      : null,
  }
}

export async function getConsumerDashboardData(profileId: string): Promise<ConsumerDashboardData> {
  const profile = await findProfileById(profileId)
  if (!profile) {
    return {
      building: null,
      businesses: [],
      promotions: [],
      marketplaceItems: [],
      savedPromotionIds: [],
      usedPromotionIds: [],
      unitMemberships: [],
      householdMembers: [],
      buildingInformation: [],
      complaintReasons: [],
      complaintMentionableUsers: [],
      complaintCases: [],
      complaintCaseDetails: [],
    }
  }

  const membershipRows = await listFullMembershipsForProfileFromPostgres(profileId)
  const unitMemberships = membershipRows.map((row) => mapUnitProfileMembership(membershipRowToNested(row)))
  const buildingId =
    profile.buildingId ?? unitMemberships[0]?.buildingId ?? null

  const [
    buildingRow,
    promotionsRows,
    marketplaceRows,
    savedIds,
    usedIds,
    reasonsRows,
    complaintRows,
    mentionablesRows,
    businessesRows,
    buildingInfoRows,
  ] = await Promise.all([
    buildingId ? getBuildingFullByIdFromPostgres(buildingId) : Promise.resolve(null),
    getPublicPromotionsFromPostgres(500),
    buildingId ? listMarketplaceItemsForBuildingFromPostgres(buildingId) : Promise.resolve([]),
    listSavedPromotionIdsForProfileFromPostgres(profileId),
    listUsedPromotionIdsForProfileFromPostgres(profileId),
    listComplaintReasonsFromPostgres(),
    buildingId
      ? listNeighborComplaintCasesFromPostgres({ profileId, buildingId })
      : Promise.resolve([]),
    buildingId ? listMentionablesForBuildingFromPostgres(buildingId) : Promise.resolve([]),
    getAllBusinessesFromPostgres(),
    buildingId
      ? listBuildingInformationForBuildingFromPostgres({
          buildingId,
          visibleTo: ['residentes', 'vecinos'],
        })
      : Promise.resolve([]),
  ])

  const householdUnitId =
    unitMemberships.find((membership) => membership.relationshipType === 'vecino_principal')?.unitId ??
    unitMemberships[0]?.unitId ??
    null

  const householdRows = householdUnitId
    ? await listHouseholdMembershipsForUnitFromPostgres(householdUnitId)
    : []

  const mentionableUsers = mentionablesRows
    .map((row) => mapMentionableUser(row, row.building_id))
    .filter((user, index, array) => array.findIndex((item) => item.profileId === user.profileId) === index)
    .sort((a: ComplaintCaseMentionableUser, b: ComplaintCaseMentionableUser) => a.label.localeCompare(b.label))

  const complaintCaseDetails = complaintRows.map((row: any) => mapNeighborComplaintCaseDetail(row, mentionableUsers))
  const complaintCases = complaintCaseDetails
    .map(buildComplaintCaseListItem)
    .sort((a: ComplaintCaseListItem, b: ComplaintCaseListItem) => b.lastEventAt.localeCompare(a.lastEventAt))

  const promotions = applyPromotionAutoRenewal(promotionsRows.map(mapPromotionFromPostgresRow))
    .filter((promotion) => !promotion.buildingId || promotion.buildingId === buildingId)
  const businesses = businessesRows
    .map((row) => mapBusinessFromPostgresRow(row))
    .filter((row): row is Business => Boolean(row))

  return {
    building: buildingRow
      ? mapBuilding({
          id: buildingRow.id,
          name: buildingRow.name,
          address: buildingRow.address,
          total_units: buildingRow.total_units,
          latitude: buildingRow.latitude,
          longitude: buildingRow.longitude,
          created_at: buildingRow.created_at,
        })
      : null,
    businesses,
    promotions,
    marketplaceItems: marketplaceRows.map((row) =>
      mapMarketplaceItem(null, {
        id: row.id,
        title: row.title,
        description: row.description,
        price: row.price,
        condition: row.condition,
        seller_profile_id: row.seller_profile_id,
        building_id: row.building_id,
        created_at: row.created_at,
        image_path: row.image_path,
        is_active: row.is_active,
        profiles: {
          full_name: row.seller_full_name,
          avatar_text: row.seller_avatar_text,
          phone: row.seller_phone,
        },
      }),
    ),
    savedPromotionIds: savedIds,
    usedPromotionIds: usedIds,
    unitMemberships,
    householdMembers: householdRows.map((row) => mapUnitProfileMembership(membershipRowToNested(row))),
    buildingInformation: buildingInfoRows.map(mapBuildingInformation),
    complaintReasons: reasonsRows.map(mapComplaintReason),
    complaintMentionableUsers: mentionableUsers,
    complaintCases,
    complaintCaseDetails,
  }
}

export async function getOwnerDashboardData(profileId: string): Promise<OwnerDashboardData | null> {
  const profileRow = await findProfileById(profileId)
  if (!profileRow) return null

  const membershipRows = await getUnitProfileMembershipsForProfileFromPostgres(profileId, 'propietario')
  const memberships = membershipRows.map(mapUnitProfileMembership)
  const unitIds = memberships.map((membership) => membership.unitId)
  const buildingIds = Array.from(new Set(memberships.map((membership) => membership.buildingId)))

  const [liquidationRows, paymentsRows, buildingInfoRows] = await Promise.all([
    getOwnerLiquidationItemsByUnitIdsFromPostgres(unitIds),
    getOwnerPaymentsByUnitIdsFromPostgres(unitIds),
    getBuildingInformationByBuildingIdsFromPostgres(buildingIds, ['residentes', 'propietarios']),
  ])

  const latestByUnit = new Map<string, IAdminLiquidationItem>()
  for (const item of liquidationRows) {
    if (latestByUnit.has(item.unit_id)) continue
    const unit = item.iadmin_units
    const holders = Array.isArray(unit?.iadmin_unit_holders) ? unit.iadmin_unit_holders : []
    const activeHolder = holders.find((holder) => holder?.is_active) ?? null
    const ordinaryAmount = Number(item.ordinary_amount ?? item.amount ?? 0)
    const extraordinaryAmount = Number(item.extraordinary_amount ?? 0)
    const previousBalance = Number(item.previous_balance ?? 0)
    const subtotal = round2(ordinaryAmount + extraordinaryAmount + previousBalance)

    latestByUnit.set(item.unit_id, {
      id: item.id,
      unitId: item.unit_id,
      unitCode: unit?.code ?? 'Unidad',
      unitKind: (unit?.kind ?? 'otro') as IAdminUnitKind,
      activeHolderName: activeHolder?.full_name ?? null,
      activeHolderKind: (activeHolder?.holder_kind ?? null) as IAdminHolderKind | null,
      prorataCoefficient: Number(item.prorata_coefficient ?? 0),
      ordinaryAmount,
      extraordinaryAmount,
      previousBalance,
      amount: ordinaryAmount,
      subtotal,
      dueAmounts: [],
      collectedAmount: 0,
      balanceRemaining: subtotal,
      payments: [],
    })
  }

  const paymentsByUnit = new Map<string, IAdminPayment[]>()
  for (const payment of paymentsRows) {
    const mapped = mapPayment(payment)
    const existing = paymentsByUnit.get(mapped.unitId ?? '') ?? []
    existing.push(mapped)
    if (mapped.unitId) paymentsByUnit.set(mapped.unitId, existing)
  }

  const units: OwnerUnitSummary[] = memberships.map((membership) => {
    const latestLiquidation = latestByUnit.get(membership.unitId) ?? null
    const payments = paymentsByUnit.get(membership.unitId) ?? []
    const latestPayments = latestLiquidation
      ? payments.filter((payment) => payment.liquidationItemId === latestLiquidation.id)
      : []
    const collectedAmount = round2(latestPayments.reduce((sum, payment) => sum + payment.amount, 0))

    return {
      membership,
      latestLiquidation: latestLiquidation
        ? {
            ...latestLiquidation,
            payments: latestPayments,
            collectedAmount,
            balanceRemaining: Math.max(round2(latestLiquidation.subtotal - collectedAmount), 0),
          }
        : null,
      payments,
    }
  })

  return {
    profile: mapProfile(profileRow),
    units,
    buildingInformation: buildingInfoRows.map(mapBuildingInformation),
  }
}

// ----------------------------------------------------------------------------
// IAdmin: lecturas base del backoffice administrativo
// ----------------------------------------------------------------------------

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

function mapManagedProperty(row: any): IAdminManagedProperty {
  const building = Array.isArray(row.buildings) ? row.buildings[0] : row.buildings
  return {
    id: row.id,
    administrationId: row.administration_id,
    buildingId: row.building_id,
    buildingName: building?.name ?? 'Edificio',
    buildingAddress: building?.address ?? '',
    displayName: row.display_name ?? null,
    propertyKind: row.property_kind ?? 'consorcio',
    taxId: row.tax_id ?? null,
    managedSince: row.managed_since ?? null,
    managementFeePct: row.management_fee_pct !== null ? Number(row.management_fee_pct) : null,
    notes: row.notes ?? null,
    isActive: Boolean(row.is_active),
    totalUnits: building?.total_units ?? 0,
    legalInfo: (row.legal_info ?? {}) as IAdminLegalInfo,
    createdAt: row.created_at,
  }
}

function mapManagedPropertyFromPostgresRow(row: Awaited<ReturnType<typeof getIAdminManagedPropertiesByAdministrationFromPostgres>>[number]): IAdminManagedProperty {
  return {
    id: row.id,
    administrationId: row.administration_id,
    buildingId: row.building_id,
    buildingName: row.building_name ?? 'Edificio',
    buildingAddress: row.building_address ?? '',
    displayName: row.display_name ?? null,
    propertyKind: (row.property_kind ?? 'consorcio') as IAdminPropertyKind,
    taxId: row.tax_id ?? null,
    managedSince: row.managed_since ?? null,
    managementFeePct: row.management_fee_pct !== null ? Number(row.management_fee_pct) : null,
    notes: row.notes ?? null,
    isActive: Boolean(row.is_active),
    totalUnits: Number(row.total_units ?? 0),
    legalInfo: (row.legal_info ?? {}) as IAdminLegalInfo,
    createdAt: row.created_at,
  }
}

function mapUnit(row: any): IAdminUnit {
  const holder = Array.isArray(row.iadmin_unit_holders)
    ? row.iadmin_unit_holders.find((h: any) => h?.is_active) ?? row.iadmin_unit_holders[0] ?? null
    : null
  return {
    id: row.id,
    managedPropertyId: row.managed_property_id,
    code: row.code,
    kind: row.kind ?? 'departamento',
    floor: row.floor ?? null,
    surfaceM2: row.surface_m2 !== null ? Number(row.surface_m2) : null,
    prorataCoefficient: row.prorata_coefficient !== null ? Number(row.prorata_coefficient) : null,
    isActive: Boolean(row.is_active),
    activeHolderName: holder?.full_name ?? null,
    activeHolderKind: holder?.holder_kind ?? null,
  }
}

function mapAccountingPeriod(row: any): IAdminAccountingPeriod {
  return {
    id: row.id,
    managedPropertyId: row.managed_property_id,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    status: row.status,
    closedAt: row.closed_at ?? null,
  }
}

function mapAIExtraction(row: any): IAdminAIExtraction {
  return {
    id: row.id,
    documentId: row.document_id,
    status: row.status,
    provider: row.provider ?? null,
    suggestedFields: row.suggested_fields ?? null,
    confidence: row.confidence !== null ? Number(row.confidence) : null,
    validatedBy: row.validated_by ?? null,
    validatedAt: row.validated_at ?? null,
    validationNotes: row.validation_notes ?? null,
  }
}

function mapExpenseSummary(row: any, propertyName: string): IAdminExpenseSummary {
  const provider = Array.isArray(row.iadmin_providers) ? row.iadmin_providers[0] : row.iadmin_providers
  const documents = Array.isArray(row.iadmin_expense_documents) ? row.iadmin_expense_documents : []
  const pendingExtraction = documents.some((doc: any) => {
    const extraction = Array.isArray(doc.iadmin_ai_document_extractions)
      ? doc.iadmin_ai_document_extractions[0]
      : doc.iadmin_ai_document_extractions
    return extraction && extraction.status !== 'validated'
  })

  return {
    id: row.id,
    administrationId: row.administration_id,
    managedPropertyId: row.managed_property_id,
    managedPropertyName: propertyName,
    providerName: provider?.name ?? null,
    category: row.category ?? null,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency ?? 'ARS',
    issuedAt: row.issued_at ?? null,
    status: row.status,
    expenseKind: (row.expense_kind ?? 'ordinaria') as 'ordinaria' | 'extraordinaria',
    hasDocuments: documents.length > 0,
    pendingExtraction,
    createdAt: row.created_at,
  }
}

function mapExpenseSummaryFromPostgresRow(
  row: Awaited<ReturnType<typeof getIAdminExpensesInboxFromPostgres>>[number],
): IAdminExpenseSummary {
  return {
    id: row.id,
    administrationId: row.administration_id,
    managedPropertyId: row.managed_property_id,
    managedPropertyName: row.property_display_name ?? row.building_name ?? 'Consorcio',
    providerName: row.provider_name ?? null,
    category: row.category ?? null,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency ?? 'ARS',
    issuedAt: row.issued_at ?? null,
    status: row.status as IAdminExpenseStatus,
    expenseKind: (row.expense_kind ?? 'ordinaria') as 'ordinaria' | 'extraordinaria',
    hasDocuments: Number(row.document_count ?? 0) > 0,
    pendingExtraction: Number(row.pending_extraction_count ?? 0) > 0,
    createdAt: row.created_at,
  }
}

export async function getIAdminPortfolio(administrationId: string): Promise<IAdminPortfolio | null> {
  const [adminData, propertyRows, stats] = await Promise.all([
    getIAdminAdministrationByIdFromPostgres(administrationId),
    getIAdminManagedPropertiesByAdministrationFromPostgres(administrationId),
    getIAdminPortfolioStatsFromPostgres(administrationId),
  ])

  if (!adminData) return null

  const properties = propertyRows.map(mapManagedPropertyFromPostgresRow)
  const totalUnits = properties.reduce((sum, p) => sum + p.totalUnits, 0)

  return {
    administration: {
      id: adminData.id,
      name: adminData.name,
      legalName: adminData.legal_name ?? null,
      taxId: adminData.tax_id ?? null,
      contactEmail: adminData.contact_email ?? null,
      contactPhone: adminData.contact_phone ?? null,
      isActive: Boolean(adminData.is_active),
      legalInfo: (adminData.legal_info ?? {}) as IAdminLegalInfo,
      createdAt: adminData.created_at,
    },
    properties,
    stats: {
      totalProperties: properties.length,
      totalUnits,
      openExpenses: Number(stats.open_expenses_count ?? 0),
      pendingDocs: Number(stats.pending_docs_count ?? 0),
    },
  }
}

export async function getIAdminConsorcioDetail(propertyId: string): Promise<IAdminConsorcioDetail | null> {
  const propertyRow = await getIAdminManagedPropertyByIdFromPostgres(propertyId)
  if (!propertyRow) return null

  const property = mapManagedPropertyFromPostgresRow(propertyRow as Awaited<ReturnType<typeof getIAdminManagedPropertiesByAdministrationFromPostgres>>[number])
  const now = new Date()
  const periodYear = now.getFullYear()
  const periodMonth = now.getMonth() + 1

  const [unitsRows, periodRow, expenseRows, holderCount, buildingInfoRows] = await Promise.all([
    getIAdminUnitsByPropertyFromPostgres(propertyId),
    getIAdminAccountingPeriodForPropertyMonthFromPostgres(propertyId, periodYear, periodMonth),
    getIAdminRecentExpensesByPropertyFromPostgres(propertyId, 10),
    countActiveUnitHoldersByPropertyFromPostgres(propertyId),
    getBuildingInformationByBuildingIdsFromPostgres([property.buildingId]),
  ])

  const units = unitsRows.map(mapUnit)
  const recentExpenses = expenseRows.map((row) =>
    mapExpenseSummaryFromPostgresRow({
      ...row,
      property_display_name: property.displayName,
      building_name: property.buildingName,
    } as Awaited<ReturnType<typeof getIAdminExpensesInboxFromPostgres>>[number]),
  )

  const monthExpenses = recentExpenses.filter((expense) => {
    if (!expense.issuedAt) return false
    const date = new Date(expense.issuedAt)
    return date.getFullYear() === periodYear && date.getMonth() + 1 === periodMonth
  })
  const monthAmount = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0)

  return {
    property,
    units,
    recentExpenses,
    currentPeriod: periodRow ? mapAccountingPeriod(periodRow) : null,
    buildingInformation: buildingInfoRows.map(mapBuildingInformation),
    totals: {
      units: units.length,
      activeHolders: holderCount,
      monthExpenses: monthExpenses.length,
      monthAmount,
    },
  }
}

export async function getIAdminExpensesInbox(administrationId: string): Promise<IAdminExpenseSummary[]> {
  const rows = await getIAdminExpensesInboxFromPostgres(administrationId)
  return rows.map(mapExpenseSummaryFromPostgresRow)
}

export async function getIAdminExpenseDetail(
  expenseId: string,
): Promise<
  | {
      expense: IAdminExpenseSummary
      documents: IAdminExpenseDocument[]
      payment: { paid: boolean; paidAt: string | null; paidFromAccountName: string | null }
      cashAccounts: IAdminCashAccountWithBalance[]
    }
  | null
> {
  const row = await getExpenseDetailRowFromPostgres(expenseId)
  if (!row) return null

  const propertyName = row.property_display_name ?? row.building_name ?? 'Consorcio'

  const [docRows, paymentRow, cashAccounts] = await Promise.all([
    listExpenseDocumentsWithExtractionFromPostgres(expenseId),
    getExpensePaymentInfoFromPostgres(expenseId),
    getIAdminCashAccounts(row.managed_property_id),
  ])

  const documents: IAdminExpenseDocument[] = docRows.map((doc) => ({
    id: doc.id,
    expenseId: row.id,
    storagePath: doc.storage_path,
    fileName: doc.file_name,
    mimeType: doc.mime_type,
    sizeBytes: doc.size_bytes,
    uploadedAt: doc.uploaded_at,
    extraction: doc.extraction_id
      ? mapAIExtraction({
          id: doc.extraction_id,
          status: doc.extraction_status,
          provider: doc.extraction_provider,
          suggested_fields: doc.extraction_suggested_fields,
          confidence: doc.extraction_confidence,
          validated_by: doc.extraction_validated_by,
          validated_at: doc.extraction_validated_at,
          validation_notes: doc.extraction_validation_notes,
        })
      : null,
  }))

  const payment = {
    paid: Boolean(paymentRow),
    paidAt: paymentRow?.movement_date ?? null,
    paidFromAccountName: paymentRow?.cash_account_name ?? null,
  }

  return {
    expense: mapExpenseSummary(
      {
        id: row.id,
        administration_id: row.administration_id,
        managed_property_id: row.managed_property_id,
        iadmin_providers: row.provider_name ? { name: row.provider_name } : null,
        category: row.category,
        description: row.description,
        amount: row.amount,
        currency: row.currency,
        issued_at: row.issued_at,
        status: row.status,
        expense_kind: row.expense_kind,
        created_at: row.created_at,
      },
      propertyName,
    ),
    documents,
    payment,
    cashAccounts,
  }
}

export async function getIAdminLiquidationRuns(administrationId: string): Promise<IAdminLiquidationRunSummary[]> {
  const rows = await listLiquidationRunSummariesByAdminFromPostgres({
    administrationId,
    limit: 50,
  })
  return rows.map((row): IAdminLiquidationRunSummary => ({
    id: row.id,
    managedPropertyId: row.managed_property_id,
    managedPropertyName: row.property_display_name ?? row.building_name ?? 'Consorcio',
    periodYear: row.period_year ?? 0,
    periodMonth: row.period_month ?? 0,
    status: row.status as IAdminLiquidationStatus,
    totalExpenses: Number(row.total_expenses ?? 0),
    totalUnits: Number(row.total_units ?? 0),
    generatedAt: row.generated_at,
    closedAt: row.closed_at,
  }))
}

function mapProvider(row: any): IAdminProvider {
  return {
    id: row.id,
    administrationId: row.administration_id,
    name: row.name,
    taxId: row.tax_id ?? null,
    category: row.category ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    notes: row.notes ?? null,
    defaultCategory: row.default_category ?? null,
    defaultDescription: row.default_description ?? null,
    isRecurring: Boolean(row.is_recurring),
    recurringAmount: row.recurring_amount !== null && row.recurring_amount !== undefined ? Number(row.recurring_amount) : null,
    recurringKind: (row.recurring_kind ?? 'ordinaria') as 'ordinaria' | 'extraordinaria',
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  }
}

function mapProviderFromPostgresRow(
  row: Awaited<ReturnType<typeof getIAdminProvidersFromPostgres>>[number],
): IAdminProvider {
  return {
    id: row.id,
    administrationId: row.administration_id,
    name: row.name,
    taxId: row.tax_id ?? null,
    category: row.category ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    notes: row.notes ?? null,
    defaultCategory: row.default_category ?? null,
    defaultDescription: row.default_description ?? null,
    isRecurring: Boolean(row.is_recurring),
    recurringAmount: row.recurring_amount !== null && row.recurring_amount !== undefined ? Number(row.recurring_amount) : null,
    recurringKind: (row.recurring_kind ?? 'ordinaria') as 'ordinaria' | 'extraordinaria',
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  }
}

function mapUnitHolder(row: any): IAdminUnitHolder {
  return {
    id: row.id,
    unitId: row.unit_id,
    profileId: row.profile_id ?? null,
    fullName: row.full_name,
    taxId: row.tax_id ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    holderKind: row.holder_kind,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    isActive: Boolean(row.is_active),
  }
}

export async function getIAdminProviders(administrationId: string): Promise<IAdminProvider[]> {
  const rows = await getIAdminProvidersFromPostgres(administrationId)
  return rows.map(mapProviderFromPostgresRow)
}

export async function getIAdminUnitsWithHolders(propertyId: string): Promise<IAdminUnitWithHolders[]> {
  const units = await listUnitsBasicByPropertyFromPostgres(propertyId)
  if (units.length === 0) return []

  const unitIds = units.map((u) => u.id)
  const [holders, memberships] = await Promise.all([
    listHoldersByUnitsFromPostgres(unitIds),
    listMembershipsWithProfileByUnitsFromPostgres(unitIds),
  ])

  const holdersByUnit = new Map<string, typeof holders>()
  for (const h of holders) {
    const arr = holdersByUnit.get(h.unit_id) ?? []
    arr.push(h)
    holdersByUnit.set(h.unit_id, arr)
  }
  const membershipsByUnit = new Map<string, typeof memberships>()
  for (const m of memberships) {
    const arr = membershipsByUnit.get(m.unit_id) ?? []
    arr.push(m)
    membershipsByUnit.set(m.unit_id, arr)
  }

  return units.map((u) => {
    const baseUnit = mapUnit({
      id: u.id,
      managed_property_id: u.managed_property_id,
      code: u.code,
      kind: u.kind,
      floor: u.floor,
      surface_m2: u.surface_m2,
      prorata_coefficient: u.prorata_coefficient,
      is_active: u.is_active,
      created_at: u.created_at,
      iadmin_unit_holders: [],
    })
    const sortedHolders = (holdersByUnit.get(u.id) ?? [])
      .map((h) => mapUnitHolder({
        id: h.id,
        unit_id: h.unit_id,
        profile_id: h.profile_id,
        full_name: h.full_name,
        holder_kind: h.holder_kind,
        tax_id: h.tax_id,
        email: h.email,
        phone: h.phone,
        start_date: h.start_date,
        end_date: h.end_date,
        is_active: h.is_active,
        created_at: h.created_at,
      }))
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        return (b.startDate ?? '').localeCompare(a.startDate ?? '')
      })
    const sortedMemberships = (membershipsByUnit.get(u.id) ?? [])
      .map((m) => mapUnitProfileMembership({
        id: m.id,
        unit_id: m.unit_id,
        building_id: m.building_id,
        profile_id: m.profile_id,
        relationship_type: m.relationship_type,
        is_primary: m.is_primary,
        active: m.active,
        created_at: m.created_at,
        created_by_profile_id: m.created_by_profile_id,
        profiles: m.profile_full_name
          ? {
              id: m.profile_id,
              email: m.profile_email,
              full_name: m.profile_full_name,
              role: m.profile_role,
              floor: m.profile_floor,
              unit: m.profile_unit,
            }
          : null,
      }))
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1
        return a.relationshipType.localeCompare(b.relationshipType) || a.createdAt.localeCompare(b.createdAt)
      })
    return { ...baseUnit, holders: sortedHolders, memberships: sortedMemberships }
  })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function mapPayment(row: any): IAdminPayment {
  const cashAccount = Array.isArray(row.iadmin_cash_accounts) ? row.iadmin_cash_accounts[0] : row.iadmin_cash_accounts
  const unit = Array.isArray(row.iadmin_units) ? row.iadmin_units[0] : row.iadmin_units
  return {
    id: row.id,
    administrationId: row.administration_id,
    managedPropertyId: row.managed_property_id,
    liquidationRunId: row.liquidation_run_id ?? null,
    liquidationItemId: row.liquidation_item_id ?? null,
    unitId: row.unit_id ?? null,
    unitCode: unit?.code ?? null,
    cashAccountId: row.cash_account_id ?? null,
    cashAccountName: cashAccount?.name ?? null,
    bankMovementId: row.bank_movement_id ?? null,
    amount: Number(row.amount),
    surchargeAmount: Number(row.surcharge_amount ?? 0),
    paidAt: row.paid_at,
    method: row.method ?? null,
    reference: row.reference ?? null,
    receiptNumber: row.receipt_number ?? null,
    dueLabel: row.due_label ?? null,
    notes: row.notes ?? null,
    isVoid: Boolean(row.is_void),
    voidedAt: row.voided_at ?? null,
    voidReason: row.void_reason ?? null,
    createdAt: row.created_at,
  }
}

function computeDueAmountsForItem(
  ordinary: number,
  extraordinary: number,
  previousBalance: number,
  dueDates: IAdminDueDate[],
): IAdminLiquidationItemDueAmount[] {
  const subtotal = ordinary + extraordinary + previousBalance
  return dueDates.map((due) => ({
    label: due.label,
    date: due.date,
    surchargePct: due.surchargePct,
    amount: round2(subtotal * (1 + due.surchargePct / 100)),
  }))
}

export async function getIAdminLiquidationRunDetail(runId: string): Promise<IAdminLiquidationRunDetail | null> {
  const row = await getLiquidationRunHeaderFromPostgres(runId)
  if (!row) return null

  const dueDates = ((row.due_dates ?? []) as any[]).map(
    (d: any): IAdminDueDate => ({
      label: d.label ?? '',
      date: d.date ?? '',
      surchargePct: Number(d.surcharge_pct ?? d.surchargePct ?? 0),
    }),
  )

  const [itemRows, paymentRows, expenseRows] = await Promise.all([
    listLiquidationItemsDetailedFromPostgres(runId),
    listLivePaymentsByRunDetailedFromPostgres(runId),
    listImputedExpenseLinesByPeriodFromPostgres(row.accounting_period_id),
  ])

  const payments: IAdminPayment[] = paymentRows.map((p): IAdminPayment => ({
    id: p.id,
    administrationId: p.administration_id,
    managedPropertyId: p.managed_property_id,
    liquidationRunId: p.liquidation_run_id,
    liquidationItemId: p.liquidation_item_id,
    unitId: p.unit_id,
    unitCode: p.unit_code,
    cashAccountId: p.cash_account_id,
    cashAccountName: p.cash_account_name,
    bankMovementId: p.bank_movement_id,
    amount: Number(p.amount),
    surchargeAmount: Number(p.surcharge_amount ?? 0),
    paidAt: p.paid_at,
    method: p.method,
    reference: p.reference,
    receiptNumber: p.receipt_number,
    dueLabel: p.due_label,
    notes: p.notes,
    isVoid: Boolean(p.is_void),
    voidedAt: p.voided_at,
    voidReason: p.void_reason,
    createdAt: p.created_at,
  }))
  const paymentsByItem = new Map<string, IAdminPayment[]>()
  for (const p of payments) {
    if (!p.liquidationItemId) continue
    const arr = paymentsByItem.get(p.liquidationItemId) ?? []
    arr.push(p)
    paymentsByItem.set(p.liquidationItemId, arr)
  }

  const items: IAdminLiquidationItem[] = itemRows
    .map((item): IAdminLiquidationItem => {
      const ordinaryAmount = Number(item.ordinary_amount ?? item.amount ?? 0)
      const extraordinaryAmount = Number(item.extraordinary_amount ?? 0)
      const previousBalance = Number(item.previous_balance ?? 0)
      const subtotal = round2(ordinaryAmount + extraordinaryAmount + previousBalance)
      const itemPayments = paymentsByItem.get(item.id) ?? []
      const collectedAmount = round2(itemPayments.reduce((s, p) => s + p.amount, 0))
      const balanceRemaining = round2(Math.max(0, subtotal - collectedAmount))
      return {
        id: item.id,
        unitId: item.unit_id,
        unitCode: item.unit_code ?? '—',
        unitKind: (item.unit_kind ?? 'otro') as IAdminUnitKind,
        activeHolderName: item.active_holder_full_name,
        activeHolderKind: (item.active_holder_kind ?? null) as IAdminHolderKind | null,
        prorataCoefficient: Number(item.prorata_coefficient),
        ordinaryAmount,
        extraordinaryAmount,
        previousBalance,
        amount: ordinaryAmount,
        subtotal,
        dueAmounts: computeDueAmountsForItem(ordinaryAmount, extraordinaryAmount, previousBalance, dueDates),
        collectedAmount,
        balanceRemaining,
        payments: itemPayments,
      }
    })
    .sort((a: IAdminLiquidationItem, b: IAdminLiquidationItem) => a.unitCode.localeCompare(b.unitCode))

  const expenseLines: IAdminExpenseLineInRun[] = expenseRows.map((e) => ({
    id: e.id,
    issuedAt: e.issued_at,
    providerName: e.provider_name,
    description: e.description,
    category: e.category,
    amount: Number(e.amount),
    kind: (e.expense_kind ?? 'ordinaria') as 'ordinaria' | 'extraordinaria',
  }))

  const ordinaryExpenses = round2(
    expenseLines.filter((l) => l.kind === 'ordinaria').reduce((s, l) => s + l.amount, 0),
  )
  const extraordinaryExpenses = round2(
    expenseLines.filter((l) => l.kind === 'extraordinaria').reduce((s, l) => s + l.amount, 0),
  )

  // Ingresos reales: sumamos los pagos vivos de esta run
  const ordinaryIncome = round2(payments.reduce((s, p) => s + p.amount, 0))
  const extraordinaryIncome = 0 // por ahora no distinguimos ord/ext en el pago
  const previousBalance = Number(row.previous_balance ?? 0)

  const cashStatement: IAdminCashStatement = {
    previousBalance,
    ordinaryIncome,
    extraordinaryIncome,
    totalIncome: round2(ordinaryIncome + extraordinaryIncome),
    ordinaryExpenses,
    extraordinaryExpenses,
    totalExpenses: round2(ordinaryExpenses + extraordinaryExpenses),
    endingBalance: round2(previousBalance + ordinaryIncome + extraordinaryIncome - ordinaryExpenses - extraordinaryExpenses),
  }

  const totalAssigned = round2(items.reduce((sum, it) => sum + it.subtotal, 0))
  const totalExpenses = Number(row.total_expenses ?? 0)
  const coverageDelta = round2(totalExpenses - round2(items.reduce((sum, it) => sum + it.ordinaryAmount, 0)))
  const collectedTotal = round2(items.reduce((sum, it) => sum + it.collectedAmount, 0))
  const balanceTotal = round2(items.reduce((sum, it) => sum + it.balanceRemaining, 0))

  const cashAccounts = await getIAdminCashAccounts(row.managed_property_id)

  return {
    id: row.id,
    administrationId: row.administration_id,
    administrationName: row.administration_name ?? '',
    administrationLegalInfo: (row.administration_legal_info ?? {}) as IAdminLegalInfo,
    propertyLegalInfo: (row.property_legal_info ?? {}) as IAdminLegalInfo,
    managedPropertyId: row.managed_property_id,
    managedPropertyName: row.property_display_name ?? row.building_name ?? 'Consorcio',
    managedPropertyAddress: row.building_address ?? '',
    accountingPeriodId: row.accounting_period_id,
    periodYear: row.period_year ?? 0,
    periodMonth: row.period_month ?? 0,
    status: row.status as IAdminLiquidationStatus,
    totalExpenses,
    ordinaryTotal: Number(row.ordinary_total ?? 0),
    extraordinaryTotal: Number(row.extraordinary_total ?? 0),
    previousBalance,
    totalUnits: Number(row.total_units ?? 0),
    generatedAt: row.generated_at,
    generatedByName: row.generated_by_name,
    issuedAt: row.issued_at,
    issuedByName: row.issued_by_name,
    closedAt: row.closed_at,
    closedByName: row.closed_by_name,
    dueDates,
    items,
    expenseLines,
    cashStatement,
    totalAssigned,
    coverageDelta,
    collectedTotal,
    balanceTotal,
    cashAccounts,
  }
}

export async function getIAdminConsorcioDashboard(propertyId: string): Promise<IAdminConsorcioDashboard | null> {
  const propertyRow = await getManagedPropertyFullFromPostgres(propertyId)
  if (!propertyRow) return null

  const property = mapManagedProperty({
    id: propertyRow.id,
    administration_id: propertyRow.administration_id,
    building_id: propertyRow.building_id,
    display_name: propertyRow.display_name,
    property_kind: propertyRow.property_kind,
    tax_id: propertyRow.tax_id,
    managed_since: propertyRow.managed_since,
    management_fee_pct: propertyRow.management_fee_pct,
    notes: propertyRow.notes,
    is_active: propertyRow.is_active,
    legal_info: propertyRow.legal_info,
    created_at: propertyRow.created_at,
    buildings: {
      id: propertyRow.building_id,
      name: propertyRow.building_name,
      address: propertyRow.building_address,
      total_units: propertyRow.total_units,
    },
  })
  const administrationId = property.administrationId

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [expenses, activeUnitsCount, runs, cashAccounts] = await Promise.all([
    listExpensesForDashboardFromPostgres(propertyId),
    countActiveUnitsByPropertyFromPostgres(propertyId),
    listDashboardRunsFromPostgres({ managedPropertyId: propertyId, limit: 12 }),
    getIAdminCashAccounts(propertyId),
  ])

  // ---- Saldos ----
  const activeAccounts = cashAccounts.filter((a) => a.isActive)
  const balances: IAdminDashboardCashSnapshot[] = activeAccounts.map((a) => ({
    label: a.name,
    amount: a.currentBalance,
    kind: a.kind === 'reserve' ? 'reserve' : a.kind === 'cash' ? 'cash' : 'bank',
  }))
  if (balances.length === 0) {
    balances.push({
      label: 'Sin cuentas cargadas',
      amount: 0,
      kind: 'operating',
      placeholder: true,
    })
  }
  const totalBalance = balances.reduce((sum, b) => sum + b.amount, 0)

  // ---- Cuentas por pagar a proveedores ----
  const candidateExpenseIds = expenses
    .filter((e) => e.status === 'approved' || e.status === 'imputed')
    .map((e) => e.id)
  const paidExpenseIds = await listPaidExpenseIdsFromPostgres(candidateExpenseIds)

  const payableMap = new Map<string, IAdminAccountPayable>()
  for (const e of expenses) {
    if (e.status !== 'approved' && e.status !== 'imputed') continue
    if (paidExpenseIds.has(e.id)) continue
    const providerId = e.provider_id ?? null
    const providerName = e.provider_name ?? 'Sin proveedor'
    const key = providerId ?? 'no-provider'
    const current = payableMap.get(key) ?? {
      providerId,
      providerName,
      amount: 0,
      expensesCount: 0,
      oldestDate: null,
    }
    current.amount += Number(e.amount)
    current.expensesCount += 1
    if (!current.oldestDate || (e.issued_at && e.issued_at < current.oldestDate)) {
      current.oldestDate = e.issued_at ?? current.oldestDate
    }
    payableMap.set(key, current)
  }
  const accountsPayable = Array.from(payableMap.values()).sort((a, b) => b.amount - a.amount)
  const totalPayable = accountsPayable.reduce((sum, p) => sum + p.amount, 0)

  // ---- Liquidados / Cobranzas del periodo actual ----
  const currentRun = runs.find(
    (r) => r.period_year === currentYear && r.period_month === currentMonth,
  )
  const liquidatedOrdinary = currentRun ? Number(currentRun.ordinary_total ?? 0) : 0
  const liquidatedExtraordinary = currentRun ? Number(currentRun.extraordinary_total ?? 0) : 0
  const liquidatedTotal = liquidatedOrdinary + liquidatedExtraordinary

  let collectedTotal = currentRun ? await sumLivePaymentsForRunFromPostgres(currentRun.id) : 0
  collectedTotal = Math.round(collectedTotal * 100) / 100
  const collectedOrdinary = collectedTotal
  const collectedExtraordinary = 0
  const collectionRatePct =
    liquidatedTotal > 0 ? Math.round((collectedTotal / liquidatedTotal) * 100) : null

  const periodCollections: IAdminPeriodCollections = {
    liquidatedOrdinary,
    liquidatedExtraordinary,
    liquidatedTotal,
    collectedOrdinary,
    collectedExtraordinary,
    collectedTotal,
    collectionRatePct,
    runId: currentRun?.id ?? null,
    periodLabel: currentRun
      ? `${String(currentRun.period_month ?? 0).padStart(2, '0')}/${currentRun.period_year ?? ''}`
      : null,
    placeholder: false,
  }

  // ---- Deudas históricas ----
  const historicalRuns = runs.filter(
    (r) =>
      r.status !== 'calculated' &&
      !(r.period_year === currentYear && r.period_month === currentMonth),
  )

  const overdueBuckets: IAdminOverdueBucket[] = []
  if (historicalRuns.length > 0) {
    const runIds = historicalRuns.map((r) => r.id)
    const items = await listDashboardItemsByRunsFromPostgres(runIds)
    const itemIds = items.map((it) => it.id)
    const paidByItem = await sumLivePaymentsByItemIdsFromPostgres(itemIds)

    const itemsByRun = new Map<string, typeof items>()
    for (const it of items) {
      const arr = itemsByRun.get(it.liquidation_run_id) ?? []
      arr.push(it)
      itemsByRun.set(it.liquidation_run_id, arr)
    }

    for (const run of historicalRuns) {
      if (!run.period_year || !run.period_month) continue
      const runItems = itemsByRun.get(run.id) ?? []
      let runDebt = 0
      let unitsOwing = 0
      for (const it of runItems) {
        const subtotal =
          Number(it.ordinary_amount ?? 0) +
          Number(it.extraordinary_amount ?? 0) +
          Number(it.previous_balance ?? 0)
        const paid = paidByItem.get(it.id) ?? 0
        const debt = Math.max(0, subtotal - paid)
        if (debt > 0) {
          runDebt += debt
          unitsOwing += 1
        }
      }
      if (runDebt <= 0) continue
      const periodDate = new Date(run.period_year, run.period_month - 1, 1)
      const today = new Date(currentYear, currentMonth - 1, 1)
      const periodsOld = Math.max(
        1,
        (today.getFullYear() - periodDate.getFullYear()) * 12 +
          (today.getMonth() - periodDate.getMonth()),
      )
      overdueBuckets.push({
        periodLabel: periodLabelFromDate(run.period_year, run.period_month),
        periodsOld,
        unitsCount: unitsOwing,
        totalAmount: Math.round(runDebt * 100) / 100,
      })
    }
  }
  overdueBuckets.sort((a, b) => b.periodsOld - a.periodsOld)
  const totalOverdueAmount = overdueBuckets.reduce((s, b) => s + b.totalAmount, 0)
  const totalOverdueUnits = overdueBuckets.reduce((s, b) => s + b.unitsCount, 0)

  // ---- KPIs secundarios ----
  const pendingExpenses = expenses.filter(
    (e) => e.status === 'pending_review' || e.status === 'needs_doc',
  ).length

  const [pendingDocuments, recurringCount] = await Promise.all([
    countPendingDocsForPropertyFromPostgres(propertyId),
    countActiveRecurringProvidersFromPostgres(administrationId),
  ])

  return {
    property,
    balances,
    totalBalance,
    accountsPayable,
    totalPayable,
    periodCollections,
    overdueBuckets,
    totalOverdueAmount,
    totalOverdueUnits,
    pendingExpenses,
    pendingDocuments,
    activeUnitsCount,
    recurringProvidersCount: recurringCount,
  }
}

export async function getIAdminReminders(
  administrationId: string,
  options: { status?: IAdminReminderStatus | 'all'; limit?: number } = {},
): Promise<IAdminReminder[]> {
  const rows = await listRemindersWithContextFromPostgres({
    administrationId,
    status: options.status && options.status !== 'all' ? options.status : null,
    limit: options.limit ?? 200,
  })

  const base = process.env.NEXT_PUBLIC_APP_BASE_URL ?? ''
  return rows.map((row): IAdminReminder => ({
    id: row.id,
    administrationId: row.administration_id,
    managedPropertyId: row.managed_property_id,
    propertyName: row.property_display_name ?? row.building_name ?? null,
    liquidationItemId: row.liquidation_item_id,
    unitCode: row.unit_code ?? '—',
    holderName: row.holder_full_name,
    holderPhone: row.holder_phone,
    holderEmail: row.holder_email,
    reminderKind: row.reminder_kind as IAdminReminder['reminderKind'],
    status: row.status as IAdminReminderStatus,
    messageBody: row.message_body,
    amountDue: row.amount_due !== null ? Number(row.amount_due) : null,
    dueLabel: row.due_label,
    dueDate: row.due_date,
    generatedAt: row.generated_at,
    sentAt: row.sent_at,
    dismissedAt: row.dismissed_at,
    shareUrl: row.share_token ? `${base}/l/${row.share_token}` : null,
  }))
}

export async function getIAdminPortfolioOverview(administrationId: string): Promise<IAdminPortfolioOverview | null> {
  const [admin, propertyRows] = await Promise.all([
    getIAdminAdministrationByIdFromPostgres(administrationId),
    getIAdminManagedPropertiesByAdministrationFromPostgres(administrationId),
  ])

  if (!admin) return null

  const properties = propertyRows.map(mapManagedPropertyFromPostgresRow)
  const now = new Date()
  const overviewRows = await getIAdminPortfolioOverviewRowsFromPostgres(
    administrationId,
    now.getFullYear(),
    now.getMonth() + 1,
  )
  const overviewByProperty = new Map(overviewRows.map((row) => [row.property_id, row]))

  const rows: IAdminPortfolioPropertyRow[] = properties.map((property) => {
    const overview = overviewByProperty.get(property.id)
    const totalBalance = Number(overview?.total_balance ?? 0)
    const pendingExpenses = Number(overview?.pending_expenses ?? 0)
    const accountsPayableTotal = Number(overview?.accounts_payable_total ?? 0)
    const overdueAmount = Number(overview?.overdue_amount ?? 0)
    const currentMonthLiquidated = Number(overview?.current_month_liquidated ?? 0)
    const currentMonthCollected = Number(overview?.current_month_collected ?? 0)
    const collectionRatePct = overview?.collection_rate_pct ?? null
    const hasOpenPeriod = Boolean(overview?.has_open_period)
    const runStatusThisMonth = (overview?.run_status_this_month ?? null) as IAdminLiquidationStatus | null

    const alerts: string[] = []
    if (!hasOpenPeriod && !runStatusThisMonth) {
      alerts.push('Sin período abierto')
    }
    if (pendingExpenses > 0) {
      alerts.push(`${pendingExpenses} gastos a revisar`)
    }
    if (collectionRatePct !== null && collectionRatePct < 50) {
      alerts.push(`Cobranza baja (${collectionRatePct}%)`)
    }
    if (totalBalance < 0) {
      alerts.push('Saldo negativo')
    }

    return {
      property,
      totalBalance: Math.round(totalBalance * 100) / 100,
      pendingExpenses,
      accountsPayableTotal: Math.round(accountsPayableTotal * 100) / 100,
      overdueAmount: Math.round(overdueAmount * 100) / 100,
      currentMonthLiquidated: Math.round(currentMonthLiquidated * 100) / 100,
      currentMonthCollected: Math.round(currentMonthCollected * 100) / 100,
      collectionRatePct,
      hasOpenPeriod,
      runStatusThisMonth,
      alerts,
    }
  })

  return {
    administration: {
      id: admin.id,
      name: admin.name,
      legalName: admin.legal_name ?? null,
      taxId: admin.tax_id ?? null,
      contactEmail: admin.contact_email ?? null,
      contactPhone: admin.contact_phone ?? null,
      isActive: Boolean(admin.is_active),
      legalInfo: (admin.legal_info ?? {}) as IAdminPortfolioOverview['administration']['legalInfo'],
      createdAt: admin.created_at,
    },
    rows,
    totals: rows.reduce(
      (acc, row) => {
        acc.totalBalance += row.totalBalance
        acc.totalOverdue += row.overdueAmount
        acc.totalPayable += row.accountsPayableTotal
        acc.totalLiquidatedMonth += row.currentMonthLiquidated
        acc.totalCollectedMonth += row.currentMonthCollected
        acc.pendingExpenses += row.pendingExpenses
        return acc
      },
      {
        totalBalance: 0,
        totalOverdue: 0,
        totalPayable: 0,
        totalLiquidatedMonth: 0,
        totalCollectedMonth: 0,
        pendingExpenses: 0,
      },
    ),
  }
}

function periodLabelFromDate(year: number, month: number): string {
  const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return `${names[month - 1] ?? ''} ${year}`
}

function mapCashAccount(row: any): IAdminCashAccount {
  return {
    id: row.id,
    managedPropertyId: row.managed_property_id,
    name: row.name,
    kind: (row.kind ?? 'bank') as IAdminCashAccount['kind'],
    bankName: row.bank_name ?? null,
    accountNumber: row.account_number ?? null,
    cbu: row.cbu ?? null,
    alias: row.alias ?? null,
    openingBalance: Number(row.opening_balance ?? 0),
    openingBalanceAt: row.opening_balance_at ?? null,
    isActive: Boolean(row.is_active),
    notes: row.notes ?? null,
    createdAt: row.created_at,
  }
}

export async function getIAdminCashAccounts(propertyId: string): Promise<IAdminCashAccountWithBalance[]> {
  const rows = await listCashAccountsWithBalanceFromPostgres(propertyId)
  return rows.map((row): IAdminCashAccountWithBalance => ({
    id: row.id,
    managedPropertyId: row.managed_property_id,
    name: row.name,
    kind: row.kind as IAdminCashAccountWithBalance['kind'],
    bankName: row.bank_name,
    accountNumber: row.account_number,
    cbu: row.cbu,
    alias: row.alias,
    openingBalance: row.opening_balance !== null ? Number(row.opening_balance) : 0,
    openingBalanceAt: row.opening_balance_at,
    notes: row.notes,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    currentBalance: Math.round(Number(row.current_balance) * 100) / 100,
    movementsCount: row.movements_count,
  }))
}

export async function getIAdminCashMovements(
  propertyId: string,
  options: { accountId?: string; limit?: number } = {},
): Promise<IAdminCashMovement[]> {
  const rows = await listCashMovementsFromPostgres({
    managedPropertyId: propertyId,
    accountId: options.accountId ?? null,
    limit: options.limit ?? 100,
  })
  return rows.map((row): IAdminCashMovement => ({
    id: row.id,
    cashAccountId: row.cash_account_id,
    cashAccountName: row.cash_account_name,
    administrationId: row.administration_id,
    managedPropertyId: row.managed_property_id,
    movementDate: row.movement_date,
    description: row.description,
    amount: Number(row.amount),
    balance: row.balance !== null ? Number(row.balance) : null,
    externalRef: row.external_ref,
    movementKind: (row.movement_kind ?? 'manual') as IAdminCashMovement['movementKind'],
    expenseId: row.expense_id,
    expenseDescription: row.expense_description,
    createdAt: row.created_at,
  }))
}

/**
 * Calcula el estado de la mesa del mes (distribucion + pagos) incluso si
 * todavia no se genero la liquidation_run. Esto permite mostrar la
 * distribucion en vivo a medida que el admin carga celdas.
 *
 * Si existe un run emitido/cerrado, usa sus items como fuente de verdad.
 * Si solo hay gastos imputados sin run, calcula la distribucion al vuelo.
 */
export async function getIAdminMesaState(
  propertyId: string,
  year: number,
  month: number,
): Promise<IAdminMesaState | null> {
  const property = await getManagedPropertyAdminIdFromPostgres(propertyId)
  if (!property) return null

  const period = await getAccountingPeriodIdAndStatusFromPostgres({
    managedPropertyId: propertyId,
    periodYear: year,
    periodMonth: month,
  })

  const unitsRaw = await listActiveUnitsWithProrataAndHolderFromPostgres(propertyId)
  const units = unitsRaw.filter((u) => u.prorata_coefficient !== null)
  const alicuotaSum = units.reduce((s, u) => s + Number(u.prorata_coefficient), 0)
  const coverageOk = Math.abs(alicuotaSum - 1) < 0.001
  const coverageDeltaPct = Math.round((alicuotaSum - 1) * 10000) / 100

  // Si existe run para el periodo, usamos sus items
  let existingRun: RunForMesaRow | null = null
  let existingRunItems: RunForMesaItemRow[] = []
  if (period) {
    existingRun = await getRunForPeriodFromPostgres({
      managedPropertyId: propertyId,
      accountingPeriodId: period.id,
    })
    if (existingRun) {
      existingRunItems = await listLiquidationItemsByRunBasicFromPostgres(existingRun.id)
    }
  }

  // Totales ord/ext del periodo actual (fuente = gastos imputed)
  let ordinaryTotal = 0
  let extraordinaryTotal = 0
  if (period) {
    const totals = await sumImputedTotalsForPeriodFromPostgres({
      managedPropertyId: propertyId,
      accountingPeriodId: period.id,
    })
    ordinaryTotal = Number(totals.ord_total)
    extraordinaryTotal = Number(totals.ext_total)
  }
  ordinaryTotal = Math.round(ordinaryTotal * 100) / 100
  extraordinaryTotal = Math.round(extraordinaryTotal * 100) / 100

  // Saldo anterior por unidad (si hay run previo)
  const previousBalanceByUnit = new Map<string, number>()
  if (existingRun) {
    for (const it of existingRunItems) {
      if (it.previous_balance) previousBalanceByUnit.set(it.unit_id, Number(it.previous_balance))
    }
  } else {
    const priorItems = await getMostRecentIssuedPriorRunItemsFromPostgres({
      managedPropertyId: propertyId,
      excludePeriodId: period?.id ?? null,
    })
    if (priorItems.length > 0) {
      const priorItemIds = priorItems.map((it) => it.id)
      const paidByItem = await sumLivePaymentsByItemIdsFromPostgres(priorItemIds)
      for (const it of priorItems) {
        const sub =
          Number(it.ordinary_amount ?? 0) +
          Number(it.extraordinary_amount ?? 0) +
          Number(it.previous_balance ?? 0)
        const paid = paidByItem.get(it.id) ?? 0
        const debt = Math.max(0, Math.round((sub - paid) * 100) / 100)
        if (debt > 0) previousBalanceByUnit.set(it.unit_id, debt)
      }
    }
  }

  // Pagos del run actual
  const paidByUnitCurrent = new Map<string, number>()
  if (existingRun && existingRunItems.length > 0) {
    const itemIds = existingRunItems.map((it) => it.id)
    const byUnit = await sumLivePaymentsByUnitForItemsFromPostgres(itemIds)
    for (const [unitId, amount] of byUnit.entries()) {
      paidByUnitCurrent.set(unitId, amount)
    }
  }

  // Vencimientos: toma los del run o default (10 y 25 mes siguiente)
  const dueDates: IAdminDueDate[] = existingRun?.due_dates?.length
    ? (existingRun.due_dates as any[]).map((d: any) => ({
        label: d.label ?? '',
        date: d.date ?? '',
        surchargePct: Number(d.surcharge_pct ?? d.surchargePct ?? 0),
      }))
    : (() => {
        const next = month === 12 ? 1 : month + 1
        const ny = month === 12 ? year + 1 : year
        const mm = String(next).padStart(2, '0')
        return [
          { label: '1er vencimiento', date: `${ny}-${mm}-10`, surchargePct: 0 },
          { label: '2do vencimiento', date: `${ny}-${mm}-25`, surchargePct: 3 },
        ]
      })()

  // Generar lines por unidad
  const unitLines: IAdminMesaUnitLine[] = units.map((u) => {
    const prorata = Number(u.prorata_coefficient)
    const ord = Math.round(ordinaryTotal * prorata * 100) / 100
    const ext = Math.round(extraordinaryTotal * prorata * 100) / 100
    const prev = Math.round((previousBalanceByUnit.get(u.id) ?? 0) * 100) / 100
    const subtotal = Math.round((ord + ext + prev) * 100) / 100
    const collected = Math.round((paidByUnitCurrent.get(u.id) ?? 0) * 100) / 100
    const balance = Math.max(0, Math.round((subtotal - collected) * 100) / 100)
    const dueAmounts = dueDates.map((d) => ({
      label: d.label,
      date: d.date,
      amount: Math.round(subtotal * (1 + d.surchargePct / 100) * 100) / 100,
    }))
    return {
      unitId: u.id,
      unitCode: u.code,
      unitKind: u.kind as IAdminUnitKind,
      holderName: u.holder_full_name,
      holderPhone: u.holder_phone,
      prorataCoefficient: prorata,
      ordinary: ord,
      extraordinary: ext,
      previousBalance: prev,
      subtotal,
      collected,
      balance,
      dueAmounts,
    }
  })

  const totalToDistribute = Math.round((ordinaryTotal + extraordinaryTotal) * 100) / 100
  const totalPreviousBalance = Array.from(previousBalanceByUnit.values()).reduce((s, v) => s + v, 0)
  const totalCollected = unitLines.reduce((s, u) => s + u.collected, 0)
  const totalPending = unitLines.reduce((s, u) => s + u.balance, 0)
  const collectionRatePct = totalToDistribute + totalPreviousBalance > 0
    ? Math.round((totalCollected / (totalToDistribute + totalPreviousBalance)) * 100)
    : null

  return {
    runId: existingRun?.id ?? null,
    runStatus: (existingRun?.status ?? null) as IAdminLiquidationStatus | null,
    hasRun: Boolean(existingRun),
    ordinaryTotal,
    extraordinaryTotal,
    previousBalanceTotal: Math.round(totalPreviousBalance * 100) / 100,
    totalToDistribute,
    totalCollected: Math.round(totalCollected * 100) / 100,
    totalPending: Math.round(totalPending * 100) / 100,
    collectionRatePct,
    units: unitLines,
    dueDates,
    coverageOk,
    coverageDeltaPct,
    alicuotaSum: Math.round(alicuotaSum * 1000000) / 1000000,
  }
}

// ----------------------------------------------------------------------------
// getIAdminUnitAccountStatement: estado de cuenta de una unidad / vecino
// ----------------------------------------------------------------------------

const MONTH_LABELS_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

export async function getIAdminUnitAccountStatement(
  propertyId: string,
  unitId: string,
  options: { monthsCount?: number } = {},
): Promise<IAdminUnitAccountStatement | null> {
  const monthsCount = options.monthsCount ?? 12

  // 1. Unidad + titular activo + property
  const unitRow = await getUnitWithAdminAndHolderFromPostgres({ unitId, managedPropertyId: propertyId })
  if (!unitRow) return null
  const administrationId = unitRow.administration_id
  const prorata = Number(unitRow.prorata_coefficient ?? 0)

  // 2. Armar ventana de meses
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const months: IAdminUnitAccountMonth[] = []
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    months.push({
      year: y,
      month: m,
      label: `${MONTH_LABELS_SHORT[m - 1]} ${String(y).slice(2)}`,
      periodStatus: null,
      runId: null,
      runStatus: null,
      liquidationItemId: null,
      ordinary: 0,
      extraordinary: 0,
      previousBalance: 0,
      subtotal: 0,
      collected: 0,
      balance: 0,
      isCurrent: y === currentYear && m === currentMonth,
    })
  }

  const windowStart = new Date(months[0].year, months[0].month - 1, 1).toISOString().slice(0, 10)
  const yearsInWindow = Array.from(new Set(months.map((m) => m.year)))

  // 3-4-6 en paralelo
  const [periods, runRows, paymentsRows] = await Promise.all([
    listAccountingPeriodsByYearsFromPostgres({ managedPropertyId: propertyId, years: yearsInWindow }),
    listRunsWithUnitItemFromPostgres({ managedPropertyId: propertyId, unitId }),
    listUnitPaymentsInWindowFromPostgres({ unitId, windowStart }),
  ])

  // 3. Periodos
  const periodByKey = new Map<string, { id: string; status: IAdminPeriodStatus }>()
  for (const p of periods) {
    periodByKey.set(`${p.period_year}-${p.period_month}`, { id: p.id, status: p.status as IAdminPeriodStatus })
  }
  for (const m of months) {
    const found = periodByKey.get(`${m.year}-${m.month}`)
    if (found) m.periodStatus = found.status
  }

  // 4. Runs + items de esta unidad
  for (const r of runRows) {
    if (!r.period_year || !r.period_month) continue
    const monthTarget = months.find((mm) => mm.year === r.period_year && mm.month === r.period_month)
    if (!monthTarget) continue
    monthTarget.runId = r.run_id
    monthTarget.runStatus = r.run_status as IAdminLiquidationStatus
    if (r.item_id) {
      monthTarget.liquidationItemId = r.item_id
      monthTarget.ordinary = Number(r.ordinary_amount ?? 0)
      monthTarget.extraordinary = Number(r.extraordinary_amount ?? 0)
      monthTarget.previousBalance = Number(r.previous_balance ?? 0)
    }
  }

  // 5. Para meses sin run pero con gastos imputados, calcular subtotal estimado
  const missing = months.filter((m) => m.liquidationItemId === null && m.periodStatus !== null)
  if (missing.length > 0) {
    const periodIds = missing
      .map((m) => periodByKey.get(`${m.year}-${m.month}`)?.id)
      .filter((x): x is string => Boolean(x))
    if (periodIds.length > 0) {
      const totals = await sumImputedExpensesByPeriodsFromPostgres({
        managedPropertyId: propertyId,
        periodIds,
      })
      const byPeriod = new Map<string, { ord: number; ext: number }>()
      for (const t of totals) {
        byPeriod.set(t.accounting_period_id, { ord: Number(t.ord_total), ext: Number(t.ext_total) })
      }
      for (const m of missing) {
        const pid = periodByKey.get(`${m.year}-${m.month}`)?.id
        if (!pid) continue
        const t = byPeriod.get(pid)
        if (!t) continue
        m.ordinary = Math.round(t.ord * prorata * 100) / 100
        m.extraordinary = Math.round(t.ext * prorata * 100) / 100
      }
    }
  }

  // 6. Pagos
  const collectedByItem = new Map<string, number>()
  const paymentsFormatted: IAdminUnitPaymentReceipt[] = []
  for (const row of paymentsRows) {
    const amount = Number(row.amount ?? 0)
    if (!row.is_void && row.liquidation_item_id) {
      collectedByItem.set(row.liquidation_item_id, (collectedByItem.get(row.liquidation_item_id) ?? 0) + amount)
    }
    const periodLabel =
      row.period_year && row.period_month
        ? `${MONTH_LABELS_SHORT[row.period_month - 1]} ${String(row.period_year).slice(2)}`
        : null
    paymentsFormatted.push({
      id: row.id,
      receiptNumber: row.receipt_number,
      amount,
      paidAt: row.paid_at,
      method: row.method,
      reference: row.reference,
      dueLabel: row.due_label,
      surchargeAmount: Number(row.surcharge_amount ?? 0),
      isVoid: Boolean(row.is_void),
      notes: row.notes,
      liquidationRunId: row.liquidation_run_id,
      periodLabel,
    })
  }

  // 7. Consolidar cada mes
  for (const m of months) {
    m.subtotal = Math.round((m.ordinary + m.extraordinary + m.previousBalance) * 100) / 100
    m.collected = m.liquidationItemId
      ? Math.round((collectedByItem.get(m.liquidationItemId) ?? 0) * 100) / 100
      : 0
    m.balance = Math.max(0, Math.round((m.subtotal - m.collected) * 100) / 100)
  }

  // 8. Totales globales
  const billed = months.reduce((s, m) => s + m.subtotal, 0)
  const collected = months.reduce((s, m) => s + m.collected, 0)
  const pending = months.reduce((s, m) => s + m.balance, 0)
  const collectionRatePct = billed > 0 ? Math.round((collected / billed) * 100) : null

  return {
    propertyId,
    administrationId,
    unit: {
      id: unitId,
      code: unitRow.code,
      kind: unitRow.kind as IAdminUnitKind,
      prorataCoefficient: prorata,
      holderName: unitRow.holder_full_name,
      holderPhone: unitRow.holder_phone,
      holderEmail: unitRow.holder_email,
    },
    months,
    payments: paymentsFormatted,
    totals: {
      billed: Math.round(billed * 100) / 100,
      collected: Math.round(collected * 100) / 100,
      pending: Math.round(pending * 100) / 100,
      collectionRatePct,
    },
  }
}

export async function getIAdminMonthlyGrid(
  propertyId: string,
  options: { year?: number; monthsCount?: number } = {},
): Promise<IAdminMonthlyGrid | null> {
  const propertyRow = await getManagedPropertyFullFromPostgres(propertyId)
  if (!propertyRow) return null

  const propertyName = propertyRow.display_name ?? propertyRow.building_name ?? 'Consorcio'
  const administrationId = propertyRow.administration_id

  const now = new Date()
  const currentYear = options.year ?? now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const monthsCount = options.monthsCount ?? 3  // 2 meses previos + actual

  // Armar la ventana de meses (más reciente al final)
  const months: IAdminMonthlyGrid['months'] = []
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const short = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'][m - 1]
    months.push({
      year: y,
      month: m,
      label: `${short} ${String(y).slice(2)}`,
      isCurrent: y === currentYear && m === currentMonth,
      total: 0,
      periodStatus: null,
      runId: null,
      runStatus: null,
    })
  }

  const yearsInWindow = Array.from(new Set(months.map((m) => m.year)))

  // Paralelizar reads
  const [periodsRows, runsRows, expenseRowsRaw, providersRaw, unitsData] = await Promise.all([
    listAccountingPeriodsByYearsFromPostgres({ managedPropertyId: propertyId, years: yearsInWindow }),
    listRunsForGridFromPostgres(propertyId),
    listExpensesForGridFromPostgres({ managedPropertyId: propertyId, fromYear: months[0].year }),
    listActiveProvidersForGridFromPostgres(administrationId),
    listActiveUnitsProrataFromPostgres(propertyId),
  ])

  // Períodos
  const periodMap = new Map<string, { id: string; status: IAdminPeriodStatus }>()
  for (const p of periodsRows) {
    periodMap.set(`${p.period_year}-${p.period_month}`, { id: p.id, status: p.status as IAdminPeriodStatus })
  }
  for (const m of months) {
    const p = periodMap.get(`${m.year}-${m.month}`)
    m.periodStatus = p?.status ?? null
  }

  // Liquidaciones
  for (const r of runsRows) {
    if (!r.period_year || !r.period_month) continue
    const target = months.find((m) => m.year === r.period_year && m.month === r.period_month)
    if (target) {
      target.runId = r.id
      target.runStatus = r.status as IAdminLiquidationStatus
    }
  }

  // Profiles para resolver created_by
  const createdByIds = Array.from(
    new Set(expenseRowsRaw.map((e) => e.created_by).filter((x): x is string => Boolean(x))),
  )
  const profileNameById = await listProfileNamesByIdsFromPostgres(createdByIds)

  type ExpenseRow = {
    id: string
    amount: number
    providerId: string | null
    year: number
    month: number
    hasDocument: boolean
    status: IAdminExpenseStatus
    description: string | null
    issuedAt: string | null
    createdAt: string | null
    updatedAt: string | null
    createdByName: string | null
    documentId: string | null
    documentName: string | null
    documentPath: string | null
  }
  const expenses: ExpenseRow[] = []
  for (const e of expenseRowsRaw) {
    if (e.status === 'rejected') continue
    if (!e.period_year || !e.period_month) continue
    const inWindow = months.some((m) => m.year === e.period_year && m.month === e.period_month)
    if (!inWindow) continue
    expenses.push({
      id: e.id,
      amount: Number(e.amount),
      providerId: e.provider_id,
      year: e.period_year,
      month: e.period_month,
      hasDocument: e.doc_count > 0,
      status: e.status as IAdminExpenseStatus,
      description: e.description,
      issuedAt: e.issued_at,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      createdByName: e.created_by ? profileNameById.get(e.created_by) ?? null : null,
      documentId: e.first_doc_id,
      documentName: e.first_doc_name,
      documentPath: e.first_doc_path,
    })
  }

  const providers = providersRaw.map((p) =>
    mapProvider({
      id: p.id,
      administration_id: p.administration_id,
      name: p.name,
      category: p.category,
      default_category: p.default_category,
      default_description: p.default_description,
      email: p.email,
      phone: p.phone,
      tax_id: p.tax_id,
      notes: p.notes,
      is_recurring: p.is_recurring,
      recurring_amount: p.recurring_amount,
      recurring_kind: p.recurring_kind,
      is_active: p.is_active,
      created_at: p.created_at,
    }),
  )
  const providerById = new Map(providers.map((p) => [p.id, p]))

  // Armar filas: recurrentes primero, después los que tengan gastos en la ventana
  const rowProviderIds = new Set<string>()
  const orderedRows: IAdminMonthlyGridRow[] = []

  const recurringProviders = providers
    .filter((p) => p.isRecurring)
    .sort((a, b) => a.name.localeCompare(b.name))

  const providersWithExpensesInWindow = new Set(
    expenses.filter((e) => e.providerId).map((e) => e.providerId as string),
  )

  // Primero recurrentes
  for (const p of recurringProviders) {
    rowProviderIds.add(p.id)
    orderedRows.push(buildRow(p.id, p.name, p.defaultCategory ?? p.category, true, p.recurringKind, months, expenses, providerById))
  }

  // Después los que tengan gastos en la ventana pero no sean recurrentes
  for (const pid of providersWithExpensesInWindow) {
    if (rowProviderIds.has(pid)) continue
    const p = providerById.get(pid)
    if (!p) continue
    rowProviderIds.add(pid)
    orderedRows.push(buildRow(p.id, p.name, p.defaultCategory ?? p.category, false, 'ordinaria', months, expenses, providerById))
  }

  // Gastos sin proveedor (agrupados como "Otros")
  const noProviderExpenses = expenses.filter((e) => !e.providerId)
  let freeRow: IAdminMonthlyGridRow | null = null
  if (noProviderExpenses.length > 0) {
    const cells = months.map((m) => {
      const list = noProviderExpenses.filter((e) => e.year === m.year && e.month === m.month)
      const amount = list.length > 0 ? list.reduce((s, e) => s + e.amount, 0) : null
      const single = list.length === 1 ? list[0] : null
      return {
        year: m.year,
        month: m.month,
        amount,
        expenseId: single?.id ?? null,
        hasDocument: list.some((e) => e.hasDocument),
        isEditable: list.length <= 1 && m.periodStatus !== 'closed',
        createdByName: single?.createdByName ?? null,
        createdAt: single?.createdAt ?? null,
        updatedAt: single?.updatedAt ?? null,
        status: single?.status ?? null,
        description: single?.description ?? null,
        issuedAt: single?.issuedAt ?? null,
        documentId: single?.documentId ?? null,
        documentName: single?.documentName ?? null,
        documentPath: single?.documentPath ?? null,
      }
    })
    freeRow = {
      providerId: '',
      providerName: 'Otros (sin proveedor)',
      category: null,
      isRecurring: false,
      expenseKind: 'ordinaria',
      cells,
      lastAmount: cells.filter((c) => c.amount !== null).reverse()[0]?.amount ?? null,
    }
  }

  // Totales
  for (const m of months) {
    let total = 0
    for (const row of orderedRows) {
      const cell = row.cells.find((c) => c.year === m.year && c.month === m.month)
      if (cell?.amount) total += cell.amount
    }
    if (freeRow) {
      const cell = freeRow.cells.find((c) => c.year === m.year && c.month === m.month)
      if (cell?.amount) total += cell.amount
    }
    m.total = Math.round(total * 100) / 100
  }

  const totalByMonth: Record<string, number> = {}
  for (const m of months) totalByMonth[`${m.year}-${m.month}`] = m.total

  // Alícuota total y unidades activas
  const activeUnitsCount = unitsData.length
  const totalAlicuota = unitsData.reduce(
    (s, u) => s + (u.prorata_coefficient !== null ? Number(u.prorata_coefficient) : 0),
    0,
  )

  const currentMonthObj = months[months.length - 1]
  const readyToEmit = currentMonthObj.total > 0

  return {
    propertyId,
    propertyName,
    administrationId,
    months,
    rows: orderedRows,
    freeRow,
    totalByMonth,
    activeUnitsCount,
    totalAlicuota: Math.round(totalAlicuota * 1000000) / 1000000,
    readyToEmit,
  }
}

type GridExpenseRow = {
  id: string
  amount: number
  providerId: string | null
  year: number
  month: number
  hasDocument: boolean
  status: IAdminExpenseStatus
  description: string | null
  issuedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  createdByName: string | null
  documentId: string | null
  documentName: string | null
  documentPath: string | null
}

function buildRow(
  providerId: string,
  providerName: string,
  category: string | null,
  isRecurring: boolean,
  expenseKind: 'ordinaria' | 'extraordinaria',
  months: IAdminMonthlyGrid['months'],
  expenses: GridExpenseRow[],
  _providerById: Map<string, any>,
): IAdminMonthlyGridRow {
  const cells = months.map((m) => {
    const list = expenses.filter((e) => e.providerId === providerId && e.year === m.year && e.month === m.month)
    const total = list.reduce((s, e) => s + e.amount, 0)
    const single = list.length === 1 ? list[0] : null
    return {
      year: m.year,
      month: m.month,
      amount: list.length > 0 ? Math.round(total * 100) / 100 : null,
      expenseId: single?.id ?? null,
      hasDocument: list.some((e) => e.hasDocument),
      isEditable: list.length <= 1 && m.periodStatus !== 'closed',
      createdByName: single?.createdByName ?? null,
      createdAt: single?.createdAt ?? null,
      updatedAt: single?.updatedAt ?? null,
      status: single?.status ?? null,
      description: single?.description ?? null,
      issuedAt: single?.issuedAt ?? null,
      documentId: single?.documentId ?? null,
      documentName: single?.documentName ?? null,
      documentPath: single?.documentPath ?? null,
    }
  })
  const lastAmount = [...cells].reverse().find((c) => c.amount !== null)?.amount ?? null
  return {
    providerId,
    providerName,
    category,
    isRecurring,
    expenseKind,
    cells,
    lastAmount,
  }
}

export async function getIAdminClosingChecklist(
  propertyId: string,
  options: { year?: number; month?: number } = {},
): Promise<IAdminClosingChecklist | null> {
  const property = await getManagedPropertyAdminIdFromPostgres(propertyId)
  if (!property) return null

  const now = new Date()
  const year = options.year ?? now.getFullYear()
  const month = options.month ?? now.getMonth() + 1
  const periodLabel = `${String(month).padStart(2, '0')}/${year}`

  // Periodo del mes
  const period = await getAccountingPeriodIdAndStatusFromPostgres({
    managedPropertyId: propertyId,
    periodYear: year,
    periodMonth: month,
  })

  const periodId = period?.id ?? null
  const periodStatus = (period?.status ?? null) as IAdminClosingChecklist['periodStatus']

  // Gastos del periodo
  let expensesCount = 0
  let pendingReviewCount = 0
  if (periodId) {
    const counts = await countExpensesForPeriodFromPostgres({
      managedPropertyId: propertyId,
      accountingPeriodId: periodId,
    })
    expensesCount = counts.total
    pendingReviewCount = counts.pending_count
  }

  // Run de esta liquidacion
  let liquidationRunId: string | null = null
  let runStatus: string | null = null
  if (periodId) {
    const run = await getRunIdAndStatusForPeriodFromPostgres({
      managedPropertyId: propertyId,
      accountingPeriodId: periodId,
    })
    liquidationRunId = run?.id ?? null
    runStatus = run?.status ?? null
  }

  // Recordatorios generados hoy para esta property
  const todayStr = now.toISOString().slice(0, 10)
  const remindersTodayCount = await countRemindersGeneratedSinceFromPostgres({
    managedPropertyId: propertyId,
    sinceTimestamp: `${todayStr}T00:00:00Z`,
  })
  const hasReminders = remindersTodayCount > 0

  // Comunicado: proxy via notifications de este mes
  const firstOfMonth = new Date(year, month - 1, 1).toISOString()
  const notificationsCount = await countNotificationsSinceForAdminFromPostgres({
    administrationId: property.administration_id,
    sinceTimestamp: firstOfMonth,
  })
  const hasAnnouncement = notificationsCount > 0

  // Armar steps
  const steps: IAdminClosingStep[] = []

  steps.push({
    id: 'period_open',
    label: 'Período abierto',
    helper: 'Abrí el período contable del mes para poder cargar gastos.',
    done: Boolean(periodStatus),
    ctaHref: periodStatus ? undefined : `/iadmin/consorcios/${propertyId}`,
    ctaLabel: periodStatus ? undefined : 'Abrir período',
  })

  steps.push({
    id: 'expenses_loaded',
    label: 'Gastos del mes cargados',
    helper:
      expensesCount > 0
        ? `${expensesCount} gastos cargados${pendingReviewCount > 0 ? ` · ${pendingReviewCount} sin revisar` : ''}`
        : 'Cargá facturas manualmente o clonà recurrentes desde el dashboard.',
    done: expensesCount > 0,
    blockedReason: !periodStatus ? 'Abrí el período primero' : undefined,
    ctaHref: '/iadmin/gastos',
    ctaLabel: expensesCount > 0 ? 'Ver gastos' : 'Cargar gastos',
  })

  steps.push({
    id: 'expenses_reviewed',
    label: 'Gastos pendientes revisados',
    helper:
      pendingReviewCount === 0
        ? expensesCount > 0
          ? 'Sin gastos pendientes'
          : 'Aún no hay gastos cargados'
        : `${pendingReviewCount} gasto${pendingReviewCount === 1 ? '' : 's'} esperando revisión o documento`,
    done: expensesCount > 0 && pendingReviewCount === 0,
    ctaHref: '/iadmin/gastos',
    ctaLabel: pendingReviewCount > 0 ? `Revisar ${pendingReviewCount}` : undefined,
  })

  steps.push({
    id: 'period_locked',
    label: 'Período bloqueado (cierre provisorio)',
    helper:
      periodStatus === 'open'
        ? 'Bloqueá el período antes de liquidar para evitar nuevos gastos'
        : periodStatus === 'locked'
          ? 'Bloqueado · listo para liquidar'
          : periodStatus === 'closed'
            ? 'El período ya está cerrado'
            : 'Abrí el período primero',
    done: periodStatus === 'locked' || periodStatus === 'closed',
    blockedReason: !periodStatus ? 'Abrí el período primero' : undefined,
    ctaHref: periodStatus === 'open' ? `/iadmin/consorcios/${propertyId}` : undefined,
    ctaLabel: periodStatus === 'open' ? 'Bloquear período' : undefined,
  })

  steps.push({
    id: 'liquidation_generated',
    label: 'Liquidación generada',
    helper: liquidationRunId
      ? `Run existente en estado "${runStatus}"`
      : 'Generá la liquidación desde el dashboard',
    done: Boolean(liquidationRunId),
    blockedReason: !periodId ? 'Abrí el período primero' : undefined,
    ctaHref: liquidationRunId ? `/iadmin/liquidaciones/${liquidationRunId}` : `/iadmin/consorcios/${propertyId}`,
    ctaLabel: liquidationRunId ? 'Ver liquidación' : 'Generar ahora',
  })

  steps.push({
    id: 'liquidation_issued',
    label: 'Liquidación emitida',
    helper:
      runStatus === 'issued' || runStatus === 'closed'
        ? 'Emitida · ya podés mandar comunicado y recordatorios'
        : liquidationRunId
          ? 'La liquidación está calculada pero no emitida'
          : 'Generá la liquidación primero',
    done: runStatus === 'issued' || runStatus === 'closed',
    ctaHref: liquidationRunId ? `/iadmin/liquidaciones/${liquidationRunId}` : undefined,
    ctaLabel: liquidationRunId && runStatus !== 'issued' && runStatus !== 'closed' ? 'Emitir' : undefined,
  })

  steps.push({
    id: 'announcement_sent',
    label: 'Comunicado enviado a vecinos',
    helper: hasAnnouncement
      ? 'Tenés un comunicado registrado este mes'
      : 'Generá un comunicado con IA y mandalo por email/WhatsApp',
    done: hasAnnouncement,
    skipped: !hasAnnouncement,
    ctaHref: '/iadmin/comunicaciones',
    ctaLabel: 'Redactar con IA',
  })

  steps.push({
    id: 'reminders_generated',
    label: 'Recordatorios de hoy generados',
    helper: hasReminders
      ? 'Recordatorios listos en la bandeja'
      : 'Generá recordatorios según vencimientos y estado de pago',
    done: hasReminders,
    skipped: !hasReminders,
    ctaHref: '/iadmin/recordatorios',
    ctaLabel: 'Bandeja de recordatorios',
  })

  steps.push({
    id: 'period_closed',
    label: 'Período cerrado',
    helper:
      periodStatus === 'closed'
        ? 'Período cerrado definitivamente'
        : 'Una vez que liquidaste y mandaste el comunicado, cerrá el período',
    done: periodStatus === 'closed',
    blockedReason: runStatus !== 'issued' && runStatus !== 'closed' ? 'Emití la liquidación primero' : undefined,
    ctaHref: liquidationRunId ? `/iadmin/liquidaciones/${liquidationRunId}` : undefined,
    ctaLabel: runStatus === 'issued' ? 'Cerrar' : undefined,
  })

  const completedCount = steps.filter((s) => s.done).length
  const totalCount = steps.length
  const progressPct = Math.round((completedCount / totalCount) * 100)
  const nextStep = steps.find((s) => !s.done && !s.blockedReason) ?? null

  return {
    periodYear: year,
    periodMonth: month,
    periodLabel,
    periodStatus,
    steps,
    completedCount,
    totalCount,
    progressPct,
    nextStep,
  }
}

export function getCategoryOptions(promotions: Promotion[]) {
  const categories = new Set<string>(CATEGORIES)
  promotions.forEach((promotion) => categories.add(promotion.category))
  return ['Todas', ...Array.from(categories).filter((category) => category !== 'Todas')]
}
