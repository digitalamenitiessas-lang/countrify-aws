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
import { findProfileById } from '@/lib/db/profiles'
import { getAllBusinessesFromPostgres, getBusinessByIdFromPostgres } from '@/lib/db/businesses'
import { getPublicPromotionsFromPostgres } from '@/lib/db/public-home'
import { getPromotionsForBusinessFromPostgres, type PromotionRow } from '@/lib/db/promotions'
import { isPostgresConfigured } from '@/lib/db/postgres'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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

async function getPrimaryBuildingIdForProfile(supabase: any, profile: any): Promise<string | null> {
  if (profile?.building_id) return profile.building_id
  const { data } = await supabase
    .from('unit_profile_memberships')
    .select('building_id')
    .eq('profile_id', profile?.id)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data?.building_id ?? null
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
  if (isPostgresConfigured()) {
    try {
      const promotions = applyPromotionAutoRenewal(
        (await getPublicPromotionsFromPostgres(12)).map(mapPromotionFromPostgresRow),
      )

      return {
        promotions: promotions.slice(0, 12),
      }
    } catch (error) {
      console.error('[getHomeData] Fallback a Supabase tras fallo en RDS:', error)
    }
  }

  const supabase = await getSupabaseServerClient()
  if (!supabase) {
    return { promotions: [] }
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('promotions')
    .select(`
      *,
      businesses ( id, name, logo_path ),
      promotion_redemptions ( id )
    `)
    .eq('is_active', true)
    .gte('expiration_date', today)
    .order('created_at', { ascending: false })
    .limit(12)

  const promotions = applyPromotionAutoRenewal((data ?? []).map((row: any) => mapPromotion(supabase, row)))

  return {
    promotions: promotions.slice(0, 12),
  }
}

export async function getPromotionsPageData(): Promise<PromotionsPageData> {
  return getHomeData()
}

export async function getBusinessDashboardData(profileId: string): Promise<BusinessDashboardData> {
  const supabase = getSupabaseAdminClient() ?? (await getSupabaseServerClient())
  if (!supabase) {
    return { business: null, promotions: [], consumersCount: 0, availableBuildings: [], monthlyStatus: null, redemptionHistory: [] }
  }

  const profile = (await findProfileById(profileId))
    ?? (await supabase.from('profiles').select('*').eq('id', profileId).maybeSingle()).data
  const businessId = profile?.businessId ?? profile?.business_id ?? null

  if (businessId && isPostgresConfigured()) {
    try {
      const [{ count }, { data: buildingsData }, { data: redemptionsData }, businessRow, promotionRows] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'vecino'),
        supabase.from('buildings').select('*').order('name'),
        supabase
          .from('promotion_redemptions')
          .select(`
            id,
            profile_id,
            promotion_id,
            status,
            redeemed_at,
            created_at,
            profiles (
              id,
              full_name,
              floor,
              unit,
              buildings ( id, name )
            ),
            promotions (
              id,
              title,
              discount
            )
          `)
          .eq('promotions.business_id', businessId)
          .order('redeemed_at', { ascending: false })
          .order('created_at', { ascending: false }),
        getBusinessByIdFromPostgres(businessId),
        getPromotionsForBusinessFromPostgres(businessId),
      ])

      const rawPromotions = promotionRows.map(mapPromotionFromBusinessPostgresRow)
      const promotions = applyPromotionAutoRenewal(rawPromotions)
      const business = mapBusinessFromPostgresRow(businessRow)

      if (business) {
        return {
          business,
          promotions,
          consumersCount: count ?? 0,
          availableBuildings: (buildingsData ?? []).map(mapBuilding),
          monthlyStatus: buildPromotionMonthlyStatus(rawPromotions),
          redemptionHistory: (redemptionsData ?? []).map((row: any) => mapPromotionRedemptionHistoryItem(row)),
        }
      }
    } catch (error) {
      console.error('[getBusinessDashboardData] Fallback a Supabase tras fallo en RDS:', error)
    }
  }

  const [{ data: businessData }, { data: promotionsData }, { count }, { data: buildingsData }, { data: redemptionsData }] = await Promise.all([
    businessId ? supabase.from('businesses').select('*').eq('id', businessId).maybeSingle() : Promise.resolve({ data: null }),
    businessId
      ? supabase
          .from('promotions')
          .select(`*, businesses ( id, name ), promotion_redemptions ( id )`)
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'vecino'),
    supabase.from('buildings').select('*').order('name'),
    businessId
      ? supabase
          .from('promotion_redemptions')
          .select(`
            id,
            profile_id,
            promotion_id,
            status,
            redeemed_at,
            created_at,
            profiles (
              id,
              full_name,
              floor,
              unit,
              buildings ( id, name )
            ),
            promotions (
              id,
              title,
              discount
            )
          `)
          .eq('promotions.business_id', businessId)
          .order('redeemed_at', { ascending: false })
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  const rawPromotions = (promotionsData ?? []).map((row: any) => mapPromotion(supabase, row))
  const promotions = applyPromotionAutoRenewal(rawPromotions)

  return {
    business: businessData ? mapBusiness(supabase, businessData) : null,
    promotions,
    consumersCount: count ?? 0,
    availableBuildings: (buildingsData ?? []).map(mapBuilding),
    monthlyStatus: businessData ? buildPromotionMonthlyStatus(rawPromotions) : null,
    redemptionHistory: (redemptionsData ?? []).map((row: any) => mapPromotionRedemptionHistoryItem(row)),
  }
}

export async function getConsorcioDashboardData(profileId: string): Promise<ConsorcioDashboardData> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) {
    return {
      managedBuildings: [],
      assignments: [],
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

  const { data: assignmentsData } = await supabase
    .from('building_admin_assignments')
    .select('*')
    .eq('profile_id', profileId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  const assignments = (assignmentsData ?? []).map(mapBuildingAssignment)
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

  const [{ data: buildingsData }, { data: neighborsData }, { data: adminAssignmentsData }, { data: complaintCaseRows }] = await Promise.all([
    supabase.from('buildings').select('*').in('id', buildingIds).order('name'),
    supabase.from('profiles').select('*').eq('role', 'vecino').in('building_id', buildingIds).order('full_name'),
    supabase
      .from('building_admin_assignments')
      .select(`building_id, profiles!building_admin_assignments_profile_id_fkey ( id, full_name, role, floor, unit )`)
      .in('building_id', buildingIds),
    supabase
      .from('complaint_cases')
      .select(`
        *,
        buildings ( id, name ),
        profiles!complaint_cases_author_profile_id_fkey ( id, full_name, email, avatar_text, floor, unit ),
        complaint_case_reasons ( complaint_reason_catalog ( id, slug, label, is_other ) ),
        complaint_case_messages (
          id,
          case_id,
          message,
          message_type,
          created_at,
          profiles!complaint_case_messages_author_profile_id_fkey ( id, full_name, avatar_text, role, floor, unit ),
          complaint_case_message_mentions (
            id,
            message_id,
            mentioned_profile_id,
            profiles!complaint_case_message_mentions_mentioned_profile_id_fkey ( id, full_name, role, floor, unit )
          )
        ),
        complaint_case_events ( id, case_id, event_type, actor_label, actor_role, summary, metadata, created_at )
      `)
      .in('building_id', buildingIds)
      .order('created_at', { ascending: false }),
  ])

  const neighborsByBuilding = new Map<string, Profile[]>()
  for (const row of neighborsData ?? []) {
    const mapped = mapProfile(row)
    if (!mapped.buildingId) continue
    const current = neighborsByBuilding.get(mapped.buildingId) ?? []
    current.push(mapped)
    neighborsByBuilding.set(mapped.buildingId, current)
  }

  const adminProfilesByBuilding = new Map<string, ComplaintCaseMentionableUser[]>()
  for (const row of adminAssignmentsData ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    if (!profile?.id || !row.building_id) continue
    const current = adminProfilesByBuilding.get(row.building_id) ?? []
    if (!current.some((item) => item.profileId === profile.id)) {
      current.push(mapMentionableUser(profile, row.building_id))
    }
    adminProfilesByBuilding.set(row.building_id, current)
  }

  const caseDetailsByBuilding = new Map<string, ComplaintCaseDetailConsorcioView[]>()
  for (const row of complaintCaseRows ?? []) {
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

  const buildingsById = new Map((buildingsData ?? []).map((row: any) => [row.id, mapBuilding(row)]))
  const managedBuildings: ConsorcioManagedBuilding[] = assignments
    .map((assignment) => {
      const building = buildingsById.get(assignment.buildingId)
      if (!building) {
        return null
      }
      const neighbors = neighborsByBuilding.get(building.id) ?? []
      const complaintCaseDetails = (caseDetailsByBuilding.get(building.id) ?? []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      const complaintCases = complaintCaseDetails.map(buildComplaintCaseListItem)
      const complaintMentionableUsers = [
        ...neighbors.map((neighbor) =>
          mapMentionableUser(
            { id: neighbor.id, full_name: neighbor.fullName, role: neighbor.role, floor: neighbor.floor, unit: neighbor.unit },
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
  const supabase = await getSupabaseServerClient()
  if (!supabase) {
    return { buildings: [], users: [], businesses: [], promotions: [], consorcioAdminOptions: [] }
  }

  const [buildingsRes, usersRes, businessesRes, promotionsRes, assignmentsRes, redemptionsRes, propertiesRes] = await Promise.all([
    supabase.from('buildings').select('*').order('name'),
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('businesses').select('*').order('name'),
    supabase
      .from('promotions')
      .select(`*, businesses ( id, name ), promotion_redemptions ( id )`)
      .order('created_at', { ascending: false }),
    supabase
      .from('building_admin_assignments')
      .select(`*, profiles ( id, full_name, email, phone )`),
    supabase
      .from('promotion_redemptions')
      .select(`promotion_id, profiles ( building_id, buildings ( id, name ) )`),
    supabase
      .from('iadmin_managed_properties')
      .select(`*, buildings ( id, name, address, total_units ), iadmin_administrations ( * )`)
      .order('created_at', { ascending: false }),
  ])

  const allBuildings = (buildingsRes.data ?? []).map(mapBuilding)
  const allUsers = (usersRes.data ?? []).map(mapProfile)
  const allPromotionsRaw = (promotionsRes.data ?? []).map((row: any) => mapPromotion(supabase, row))
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
  for (const row of redemptionsRes.data ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const building = profile?.buildings ? (Array.isArray(profile.buildings) ? profile.buildings[0] : profile.buildings) : null
    if (!building?.id) continue
    if (!redemptionMap.has(row.promotion_id)) redemptionMap.set(row.promotion_id, new Map())
    const byBuilding = redemptionMap.get(row.promotion_id)!
    const current = byBuilding.get(building.id) ?? { name: building.name, count: 0 }
    current.count += 1
    byBuilding.set(building.id, current)
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

  const businesses: SuperAdminBusinessDetail[] = (businessesRes.data ?? []).map((row: any) => {
    const business = mapBusiness(supabase, row)
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

export async function getConsumerDashboardData(profileId: string): Promise<ConsumerDashboardData> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) {
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

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', profileId).single()
  const buildingId = await getPrimaryBuildingIdForProfile(supabase, profile)

  const [{ data: membershipRows }, { data: buildingData }, { data: promotionsData }, { data: marketplaceData }, { data: savedRows }, { data: usedRows }, { data: reasonRows }, { data: complaintRows }, { data: neighborRows }, { data: buildingAdminRows }, { data: businessesData }, { data: buildingInfoRows }] =
    await Promise.all([
      supabase
        .from('unit_profile_memberships')
        .select(`
          *,
          profiles!unit_profile_memberships_profile_id_fkey (*),
          iadmin_units (
            id,
            code,
            floor,
            iadmin_managed_properties ( buildings ( id, name ) )
          )
        `)
        .eq('profile_id', profileId)
        .eq('active', true)
        .order('created_at', { ascending: true }),
      buildingId ? supabase.from('buildings').select('*').eq('id', buildingId).maybeSingle() : Promise.resolve({ data: null }),
      supabase
        .from('promotions')
        .select(`*, businesses ( id, name ), promotion_redemptions ( id )`)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      buildingId
        ? supabase
            .from('marketplace_items')
            .select(`*, profiles ( full_name, avatar_text, phone )`)
            .eq('building_id', buildingId)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase.from('saved_promotions').select('promotion_id').eq('profile_id', profileId),
      supabase.from('promotion_redemptions').select('promotion_id').eq('profile_id', profileId),
      supabase.from('complaint_reason_catalog').select('*').order('label'),
      buildingId ? supabase.rpc('get_neighbor_complaint_cases', { target_building_id: buildingId }) : Promise.resolve({ data: [] }),
      buildingId ? supabase.from('profiles').select('id, full_name, role, floor, unit').eq('role', 'vecino').eq('building_id', buildingId).order('full_name') : Promise.resolve({ data: [] }),
      buildingId
        ? supabase
            .from('building_admin_assignments')
            .select(`building_id, profiles!building_admin_assignments_profile_id_fkey ( id, full_name, role, floor, unit )`)
            .eq('building_id', buildingId)
        : Promise.resolve({ data: [] }),
      supabase.from('businesses').select('*').order('name'),
      buildingId
        ? supabase
            .from('building_information')
            .select('*')
            .eq('building_id', buildingId)
            .eq('is_active', true)
            .in('visible_to', ['residentes', 'vecinos'])
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])

  const unitMemberships = (membershipRows ?? []).map(mapUnitProfileMembership)
  const householdUnitId =
    unitMemberships.find((membership) => membership.relationshipType === 'vecino_principal')?.unitId ??
    unitMemberships[0]?.unitId ??
    null

  const { data: householdRows } = householdUnitId
    ? await supabase
        .from('unit_profile_memberships')
        .select(`
          *,
          profiles!unit_profile_memberships_profile_id_fkey (*),
          iadmin_units (
            id,
            code,
            floor,
            iadmin_managed_properties ( buildings ( id, name ) )
          )
        `)
        .eq('unit_id', householdUnitId)
        .eq('active', true)
        .order('relationship_type')
        .order('created_at', { ascending: true })
    : { data: [] }

  const mentionableUsers = [
    ...((neighborRows ?? []) as any[]).map((row: any) => mapMentionableUser(row, buildingId ?? '')),
    ...((buildingAdminRows ?? []) as any[])
      .map((row: any) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
        return profile ? mapMentionableUser(profile, row.building_id) : null
      })
      .filter((user): user is ComplaintCaseMentionableUser => Boolean(user)),
  ]
    .filter((user, index, array) => array.findIndex((item) => item.profileId === user.profileId) === index)
    .sort((a: ComplaintCaseMentionableUser, b: ComplaintCaseMentionableUser) => a.label.localeCompare(b.label))

  const complaintCaseDetails = (complaintRows ?? []).map((row: any) => mapNeighborComplaintCaseDetail(row, mentionableUsers))
  const complaintCases = complaintCaseDetails
    .map(buildComplaintCaseListItem)
    .sort((a: ComplaintCaseListItem, b: ComplaintCaseListItem) => b.lastEventAt.localeCompare(a.lastEventAt))
  let promotions = applyPromotionAutoRenewal((promotionsData ?? [])
    .map((row: any) => mapPromotion(supabase, row)))
    .filter((promotion) => !promotion.buildingId || promotion.buildingId === buildingId)
  let businesses = (businessesData ?? []).map((row: any) => mapBusiness(supabase, row))

  if (isPostgresConfigured()) {
    try {
      promotions = applyPromotionAutoRenewal((await getPublicPromotionsFromPostgres(500)).map(mapPromotionFromPostgresRow))
        .filter((promotion) => !promotion.buildingId || promotion.buildingId === buildingId)
      businesses = (await getAllBusinessesFromPostgres())
        .map((row) => mapBusinessFromPostgresRow(row))
        .filter((row): row is Business => Boolean(row))
    } catch (error) {
      console.error('[getConsumerDashboardData] Fallback a Supabase tras fallo en RDS:', error)
    }
  }

  return {
    building: buildingData ? mapBuilding(buildingData) : null,
    businesses,
    promotions,
    marketplaceItems: (marketplaceData ?? []).map((row: any) => mapMarketplaceItem(supabase, row)),
    savedPromotionIds: (savedRows ?? []).map((row: any) => row.promotion_id),
    usedPromotionIds: (usedRows ?? []).map((row: any) => row.promotion_id),
    unitMemberships,
    householdMembers: (householdRows ?? []).map(mapUnitProfileMembership),
    buildingInformation: (buildingInfoRows ?? []).map(mapBuildingInformation),
    complaintReasons: (reasonRows ?? []).map((row: any) => mapComplaintReason(row)),
    complaintMentionableUsers: mentionableUsers,
    complaintCases,
    complaintCaseDetails,
  }
}

export async function getOwnerDashboardData(profileId: string): Promise<OwnerDashboardData | null> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', profileId).maybeSingle()
  if (!profileRow) return null

  const { data: membershipRows } = await supabase
    .from('unit_profile_memberships')
    .select(`
      *,
      profiles!unit_profile_memberships_profile_id_fkey (*),
      iadmin_units (
        id,
        code,
        floor,
        kind,
        iadmin_managed_properties (
          id,
          display_name,
          buildings ( id, name, address )
        )
      )
    `)
    .eq('profile_id', profileId)
    .eq('relationship_type', 'propietario')
    .eq('active', true)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  const memberships = (membershipRows ?? []).map(mapUnitProfileMembership)
  const unitIds = memberships.map((membership) => membership.unitId)
  const buildingIds = Array.from(new Set(memberships.map((membership) => membership.buildingId)))

  const [{ data: liquidationRows }, { data: paymentsRows }, { data: buildingInfoRows }] = await Promise.all([
    unitIds.length
      ? supabase
          .from('iadmin_liquidation_items')
          .select(`
            id,
            unit_id,
            prorata_coefficient,
            amount,
            ordinary_amount,
            extraordinary_amount,
            previous_balance,
            iadmin_units ( id, code, kind, iadmin_unit_holders ( id, full_name, holder_kind, is_active ) ),
            iadmin_liquidation_runs!inner (
              id,
              period_year,
              period_month,
              status,
              generated_at
            )
          `)
          .in('unit_id', unitIds)
          .order('generated_at', { referencedTable: 'iadmin_liquidation_runs', ascending: false })
      : Promise.resolve({ data: [] }),
    unitIds.length
      ? supabase
          .from('iadmin_payments')
          .select('*, iadmin_units ( id, code ), iadmin_cash_accounts ( id, name )')
          .in('unit_id', unitIds)
          .eq('is_void', false)
          .order('paid_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    buildingIds.length
      ? supabase
          .from('building_information')
          .select('*')
          .in('building_id', buildingIds)
          .eq('is_active', true)
          .in('visible_to', ['residentes', 'propietarios'])
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  const latestByUnit = new Map<string, IAdminLiquidationItem>()
  for (const item of liquidationRows ?? []) {
    if (latestByUnit.has(item.unit_id)) continue
    const unit = Array.isArray(item.iadmin_units) ? item.iadmin_units[0] : item.iadmin_units
    const holders = Array.isArray(unit?.iadmin_unit_holders) ? unit.iadmin_unit_holders : []
    const activeHolder = holders.find((holder: any) => holder?.is_active) ?? null
    const ordinaryAmount = Number(item.ordinary_amount ?? item.amount ?? 0)
    const extraordinaryAmount = Number(item.extraordinary_amount ?? 0)
    const previousBalance = Number(item.previous_balance ?? 0)
    const subtotal = round2(ordinaryAmount + extraordinaryAmount + previousBalance)

    latestByUnit.set(item.unit_id, {
      id: item.id,
      unitId: item.unit_id,
      unitCode: unit?.code ?? 'Unidad',
      unitKind: unit?.kind ?? 'otro',
      activeHolderName: activeHolder?.full_name ?? null,
      activeHolderKind: activeHolder?.holder_kind ?? null,
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
  for (const payment of paymentsRows ?? []) {
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
    buildingInformation: (buildingInfoRows ?? []).map(mapBuildingInformation),
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

export async function getIAdminPortfolio(administrationId: string): Promise<IAdminPortfolio | null> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const [{ data: adminData }, { data: propertiesData }, { count: openExpensesCount }, { count: pendingDocsCount }] =
    await Promise.all([
      supabase.from('iadmin_administrations').select('*').eq('id', administrationId).maybeSingle(),
      supabase
        .from('iadmin_managed_properties')
        .select(`*, buildings ( id, name, address, total_units )`)
        .eq('administration_id', administrationId)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
      supabase
        .from('iadmin_expenses')
        .select('*', { count: 'exact', head: true })
        .eq('administration_id', administrationId)
        .in('status', ['draft', 'pending_review', 'needs_doc']),
      supabase
        .from('iadmin_ai_document_extractions')
        .select('id, iadmin_expense_documents!inner(iadmin_expenses!inner(administration_id))', {
          count: 'exact',
          head: true,
        })
        .neq('status', 'validated')
        .eq('iadmin_expense_documents.iadmin_expenses.administration_id', administrationId),
    ])

  if (!adminData) return null

  const properties = (propertiesData ?? []).map(mapManagedProperty)
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
      openExpenses: openExpensesCount ?? 0,
      pendingDocs: pendingDocsCount ?? 0,
    },
  }
}

export async function getIAdminConsorcioDetail(propertyId: string): Promise<IAdminConsorcioDetail | null> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: propertyRow } = await supabase
    .from('iadmin_managed_properties')
    .select(`*, buildings ( id, name, address, total_units )`)
    .eq('id', propertyId)
    .maybeSingle()

  if (!propertyRow) return null

  const property = mapManagedProperty(propertyRow)

  const now = new Date()
  const periodYear = now.getFullYear()
  const periodMonth = now.getMonth() + 1

  const [{ data: unitsData }, { data: periodData }, { data: expensesData }, { count: holderCount }, { data: buildingInfoRows }] = await Promise.all([
    supabase
      .from('iadmin_units')
      .select(`*, iadmin_unit_holders ( id, full_name, holder_kind, is_active )`)
      .eq('managed_property_id', propertyId)
      .order('code'),
    supabase
      .from('iadmin_accounting_periods')
      .select('*')
      .eq('managed_property_id', propertyId)
      .eq('period_year', periodYear)
      .eq('period_month', periodMonth)
      .maybeSingle(),
    supabase
      .from('iadmin_expenses')
      .select(`
        *,
        iadmin_providers ( id, name ),
        iadmin_expense_documents ( id, iadmin_ai_document_extractions ( id, status ) )
      `)
      .eq('managed_property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('iadmin_unit_holders')
      .select('id, iadmin_units!inner(managed_property_id)', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('iadmin_units.managed_property_id', propertyId),
    supabase
      .from('building_information')
      .select('*')
      .eq('building_id', property.buildingId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
  ])

  const units = (unitsData ?? []).map(mapUnit)
  const recentExpenses = (expensesData ?? []).map((row: any) => mapExpenseSummary(row, property.displayName ?? property.buildingName))

  const monthExpenses = recentExpenses.filter((expense) => {
    if (!expense.issuedAt) return false
    const date = new Date(expense.issuedAt)
    return date.getFullYear() === periodYear && date.getMonth() + 1 === periodMonth
  })
  const monthAmount = monthExpenses.reduce((sum, e) => sum + e.amount, 0)

  return {
    property,
    units,
    recentExpenses,
    currentPeriod: periodData ? mapAccountingPeriod(periodData) : null,
    buildingInformation: (buildingInfoRows ?? []).map(mapBuildingInformation),
    totals: {
      units: units.length,
      activeHolders: holderCount ?? 0,
      monthExpenses: monthExpenses.length,
      monthAmount,
    },
  }
}

export async function getIAdminExpensesInbox(administrationId: string): Promise<IAdminExpenseSummary[]> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('iadmin_expenses')
    .select(`
      *,
      iadmin_providers ( id, name ),
      iadmin_managed_properties ( id, display_name, buildings ( name ) ),
      iadmin_expense_documents ( id, iadmin_ai_document_extractions ( id, status ) )
    `)
    .eq('administration_id', administrationId)
    .order('created_at', { ascending: false })
    .limit(50)

  return (data ?? []).map((row: any) => {
    const property = Array.isArray(row.iadmin_managed_properties)
      ? row.iadmin_managed_properties[0]
      : row.iadmin_managed_properties
    const building = property?.buildings
      ? Array.isArray(property.buildings)
        ? property.buildings[0]
        : property.buildings
      : null
    const propertyName = property?.display_name ?? building?.name ?? 'Consorcio'
    return mapExpenseSummary(row, propertyName)
  })
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
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: row } = await supabase
    .from('iadmin_expenses')
    .select(`
      *,
      iadmin_providers ( id, name ),
      iadmin_managed_properties ( id, display_name, buildings ( name ) ),
      iadmin_expense_documents (
        id,
        storage_path,
        file_name,
        mime_type,
        size_bytes,
        uploaded_at,
        iadmin_ai_document_extractions ( * )
      )
    `)
    .eq('id', expenseId)
    .maybeSingle()

  if (!row) return null

  const property = Array.isArray(row.iadmin_managed_properties)
    ? row.iadmin_managed_properties[0]
    : row.iadmin_managed_properties
  const building = property?.buildings
    ? Array.isArray(property.buildings)
      ? property.buildings[0]
      : property.buildings
    : null
  const propertyName = property?.display_name ?? building?.name ?? 'Consorcio'

  const documents: IAdminExpenseDocument[] = (row.iadmin_expense_documents ?? []).map((doc: any) => {
    const extraction = Array.isArray(doc.iadmin_ai_document_extractions)
      ? doc.iadmin_ai_document_extractions[0]
      : doc.iadmin_ai_document_extractions
    return {
      id: doc.id,
      expenseId: row.id,
      storagePath: doc.storage_path,
      fileName: doc.file_name,
      mimeType: doc.mime_type ?? null,
      sizeBytes: doc.size_bytes ?? null,
      uploadedAt: doc.uploaded_at,
      extraction: extraction ? mapAIExtraction(extraction) : null,
    }
  })

  // Estado de pago: movimiento expense_payment para este gasto
  const { data: paymentRow } = await supabase
    .from('iadmin_bank_movements')
    .select(`movement_date, iadmin_cash_accounts ( name )`)
    .eq('expense_id', expenseId)
    .eq('movement_kind', 'expense_payment')
    .maybeSingle()

  const paymentAccount = paymentRow
    ? Array.isArray(paymentRow.iadmin_cash_accounts)
      ? paymentRow.iadmin_cash_accounts[0]
      : paymentRow.iadmin_cash_accounts
    : null

  const payment = {
    paid: Boolean(paymentRow),
    paidAt: paymentRow?.movement_date ?? null,
    paidFromAccountName: paymentAccount?.name ?? null,
  }

  const cashAccounts = await getIAdminCashAccounts(row.managed_property_id)

  return {
    expense: mapExpenseSummary(row, propertyName),
    documents,
    payment,
    cashAccounts,
  }
}

export async function getIAdminLiquidationRuns(administrationId: string): Promise<IAdminLiquidationRunSummary[]> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('iadmin_liquidation_runs')
    .select(`
      *,
      iadmin_managed_properties ( id, display_name, buildings ( name ) ),
      iadmin_accounting_periods ( period_year, period_month )
    `)
    .eq('administration_id', administrationId)
    .order('generated_at', { ascending: false })
    .limit(50)

  return (data ?? []).map((row: any): IAdminLiquidationRunSummary => {
    const property = Array.isArray(row.iadmin_managed_properties)
      ? row.iadmin_managed_properties[0]
      : row.iadmin_managed_properties
    const building = property?.buildings
      ? Array.isArray(property.buildings)
        ? property.buildings[0]
        : property.buildings
      : null
    const period = Array.isArray(row.iadmin_accounting_periods)
      ? row.iadmin_accounting_periods[0]
      : row.iadmin_accounting_periods
    return {
      id: row.id,
      managedPropertyId: row.managed_property_id,
      managedPropertyName: property?.display_name ?? building?.name ?? 'Consorcio',
      periodYear: period?.period_year ?? 0,
      periodMonth: period?.period_month ?? 0,
      status: row.status,
      totalExpenses: Number(row.total_expenses ?? 0),
      totalUnits: Number(row.total_units ?? 0),
      generatedAt: row.generated_at,
      closedAt: row.closed_at ?? null,
    }
  })
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
  const supabase = await getSupabaseServerClient()
  if (!supabase) return []
  const { data } = await supabase
    .from('iadmin_providers')
    .select('*')
    .eq('administration_id', administrationId)
    .order('is_active', { ascending: false })
    .order('name')
  return (data ?? []).map(mapProvider)
}

export async function getIAdminUnitsWithHolders(propertyId: string): Promise<IAdminUnitWithHolders[]> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return []
  const { data } = await supabase
    .from('iadmin_units')
    .select(`
      *,
      iadmin_unit_holders ( * ),
      unit_profile_memberships (
        *,
        profiles!unit_profile_memberships_profile_id_fkey (*),
        iadmin_units (
          id,
          code,
          floor,
          iadmin_managed_properties ( buildings ( id, name ) )
        )
      )
    `)
    .eq('managed_property_id', propertyId)
    .order('code')

  return (data ?? []).map((row: any) => {
    const baseUnit = mapUnit(row)
    const holders = (row.iadmin_unit_holders ?? [])
      .map(mapUnitHolder)
      .sort((a: IAdminUnitHolder, b: IAdminUnitHolder) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        return (b.startDate ?? '').localeCompare(a.startDate ?? '')
      })
    const memberships = (row.unit_profile_memberships ?? [])
      .map(mapUnitProfileMembership)
      .sort((a: UnitProfileMembership, b: UnitProfileMembership) => {
        if (a.active !== b.active) return a.active ? -1 : 1
        return a.relationshipType.localeCompare(b.relationshipType) || a.createdAt.localeCompare(b.createdAt)
      })
    return { ...baseUnit, holders, memberships }
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
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: row } = await supabase
    .from('iadmin_liquidation_runs')
    .select(`
      *,
      iadmin_administrations ( id, name, legal_info ),
      iadmin_managed_properties ( id, display_name, legal_info, buildings ( name, address ) ),
      iadmin_accounting_periods ( id, period_year, period_month ),
      generated_by_profile:profiles!iadmin_liquidation_runs_generated_by_fkey ( id, full_name ),
      issued_by_profile:profiles!iadmin_liquidation_runs_issued_by_fkey ( id, full_name ),
      closed_by_profile:profiles!iadmin_liquidation_runs_closed_by_fkey ( id, full_name ),
      iadmin_liquidation_items (
        id,
        unit_id,
        prorata_coefficient,
        amount,
        ordinary_amount,
        extraordinary_amount,
        previous_balance,
        iadmin_units (
          id,
          code,
          kind,
          iadmin_unit_holders ( id, full_name, holder_kind, is_active )
        )
      )
    `)
    .eq('id', runId)
    .maybeSingle()

  if (!row) return null

  const administration = Array.isArray(row.iadmin_administrations)
    ? row.iadmin_administrations[0]
    : row.iadmin_administrations
  const property = Array.isArray(row.iadmin_managed_properties)
    ? row.iadmin_managed_properties[0]
    : row.iadmin_managed_properties
  const building = property?.buildings
    ? Array.isArray(property.buildings)
      ? property.buildings[0]
      : property.buildings
    : null
  const period = Array.isArray(row.iadmin_accounting_periods)
    ? row.iadmin_accounting_periods[0]
    : row.iadmin_accounting_periods
  const generatedBy = Array.isArray(row.generated_by_profile)
    ? row.generated_by_profile[0]
    : row.generated_by_profile
  const issuedBy = Array.isArray(row.issued_by_profile)
    ? row.issued_by_profile[0]
    : row.issued_by_profile
  const closedBy = Array.isArray(row.closed_by_profile)
    ? row.closed_by_profile[0]
    : row.closed_by_profile

  const dueDates = ((row.due_dates ?? []) as any[]).map(
    (d: any): IAdminDueDate => ({
      label: d.label ?? '',
      date: d.date ?? '',
      surchargePct: Number(d.surcharge_pct ?? d.surchargePct ?? 0),
    }),
  )

  // Traer pagos vivos (no anulados) de esta run para calcular saldo por item
  const { data: paymentsRows } = await supabase
    .from('iadmin_payments')
    .select(`
      *,
      iadmin_cash_accounts ( id, name ),
      iadmin_units ( id, code )
    `)
    .eq('liquidation_run_id', row.id)
    .eq('is_void', false)
    .order('paid_at', { ascending: false })

  const payments: IAdminPayment[] = (paymentsRows ?? []).map(mapPayment)
  const paymentsByItem = new Map<string, IAdminPayment[]>()
  for (const p of payments) {
    if (!p.liquidationItemId) continue
    const arr = paymentsByItem.get(p.liquidationItemId) ?? []
    arr.push(p)
    paymentsByItem.set(p.liquidationItemId, arr)
  }

  const items: IAdminLiquidationItem[] = (row.iadmin_liquidation_items ?? [])
    .map((item: any): IAdminLiquidationItem => {
      const unit = Array.isArray(item.iadmin_units) ? item.iadmin_units[0] : item.iadmin_units
      const holders = Array.isArray(unit?.iadmin_unit_holders) ? unit.iadmin_unit_holders : []
      const activeHolder = holders.find((h: any) => h?.is_active) ?? null
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
        unitCode: unit?.code ?? '—',
        unitKind: unit?.kind ?? 'otro',
        activeHolderName: activeHolder?.full_name ?? null,
        activeHolderKind: activeHolder?.holder_kind ?? null,
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

  // Lineas de egresos: gastos imputados del periodo
  const { data: expenseRows } = await supabase
    .from('iadmin_expenses')
    .select(`
      id, description, amount, category, issued_at, expense_kind,
      iadmin_providers ( name )
    `)
    .eq('accounting_period_id', row.accounting_period_id)
    .eq('status', 'imputed')
    .order('issued_at', { ascending: true })

  const expenseLines: IAdminExpenseLineInRun[] = (expenseRows ?? []).map((e: any) => {
    const provider = Array.isArray(e.iadmin_providers) ? e.iadmin_providers[0] : e.iadmin_providers
    return {
      id: e.id,
      issuedAt: e.issued_at ?? null,
      providerName: provider?.name ?? null,
      description: e.description,
      category: e.category ?? null,
      amount: Number(e.amount),
      kind: (e.expense_kind ?? 'ordinaria') as 'ordinaria' | 'extraordinaria',
    }
  })

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
    administrationName: administration?.name ?? '',
    administrationLegalInfo: (administration?.legal_info ?? {}) as IAdminLegalInfo,
    propertyLegalInfo: (property?.legal_info ?? {}) as IAdminLegalInfo,
    managedPropertyId: row.managed_property_id,
    managedPropertyName: property?.display_name ?? building?.name ?? 'Consorcio',
    managedPropertyAddress: building?.address ?? '',
    accountingPeriodId: row.accounting_period_id,
    periodYear: period?.period_year ?? 0,
    periodMonth: period?.period_month ?? 0,
    status: row.status,
    totalExpenses,
    ordinaryTotal: Number(row.ordinary_total ?? 0),
    extraordinaryTotal: Number(row.extraordinary_total ?? 0),
    previousBalance,
    totalUnits: Number(row.total_units ?? 0),
    generatedAt: row.generated_at,
    generatedByName: generatedBy?.full_name ?? null,
    issuedAt: row.issued_at ?? null,
    issuedByName: issuedBy?.full_name ?? null,
    closedAt: row.closed_at ?? null,
    closedByName: closedBy?.full_name ?? null,
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
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: propertyRow } = await supabase
    .from('iadmin_managed_properties')
    .select(`*, buildings ( id, name, address, total_units )`)
    .eq('id', propertyId)
    .maybeSingle()

  if (!propertyRow) return null

  const property = mapManagedProperty(propertyRow)
  const administrationId = property.administrationId

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // Paraleliza todas las queries que necesita el dashboard
  const [
    expensesRes,
    unitsRes,
    runsRes,
    periodRes,
  ] = await Promise.all([
    // Gastos del consorcio para calcular: egresos del mes, pendientes, pagables a proveedor
    supabase
      .from('iadmin_expenses')
      .select(`
        id, amount, status, expense_kind, issued_at, provider_id,
        iadmin_providers ( id, name )
      `)
      .eq('managed_property_id', propertyId)
      .order('issued_at', { ascending: false }),

    supabase
      .from('iadmin_units')
      .select('id')
      .eq('managed_property_id', propertyId)
      .eq('is_active', true),

    // Ultimas corridas cerradas / emitidas para deudas historicas y liquidado
    supabase
      .from('iadmin_liquidation_runs')
      .select(`
        id, status, ordinary_total, extraordinary_total, total_expenses,
        accounting_period_id,
        iadmin_accounting_periods ( period_year, period_month ),
        iadmin_liquidation_items ( id, ordinary_amount, extraordinary_amount, previous_balance )
      `)
      .eq('managed_property_id', propertyId)
      .in('status', ['calculated', 'issued', 'closed'])
      .order('generated_at', { ascending: false })
      .limit(12),

    supabase
      .from('iadmin_accounting_periods')
      .select('id, period_year, period_month, status')
      .eq('managed_property_id', propertyId)
      .eq('period_year', currentYear)
      .eq('period_month', currentMonth)
      .maybeSingle(),
  ])

  const expenses = expensesRes.data ?? []

  // ---- Saldos reales desde iadmin_cash_accounts ----
  const cashAccounts = await getIAdminCashAccounts(propertyId)
  const activeAccounts = cashAccounts.filter((a) => a.isActive)

  const balances: IAdminDashboardCashSnapshot[] = activeAccounts.map((a) => ({
    label: a.name,
    amount: a.currentBalance,
    kind: a.kind === 'reserve' ? 'reserve' : a.kind === 'cash' ? 'cash' : 'bank',
  }))

  if (balances.length === 0) {
    // Si todavia no hay cuentas cargadas, placeholder
    balances.push({
      label: 'Sin cuentas cargadas',
      amount: 0,
      kind: 'operating',
      placeholder: true,
    })
  }

  const totalBalance = balances.reduce((sum, b) => sum + b.amount, 0)

  // ---- Cuentas por pagar a proveedores ----
  // Gastos approved o imputed que aun NO tienen pago registrado
  // Traemos el set de expense_ids que ya fueron pagados (tienen movimiento expense_payment)
  const candidateExpenseIds = expenses
    .filter((e: any) => e.status === 'approved' || e.status === 'imputed')
    .map((e: any) => e.id)

  const paidExpenseIds = new Set<string>()
  if (candidateExpenseIds.length > 0) {
    const { data: paidRows } = await supabase
      .from('iadmin_bank_movements')
      .select('expense_id')
      .eq('movement_kind', 'expense_payment')
      .in('expense_id', candidateExpenseIds)
    for (const r of paidRows ?? []) {
      if (r.expense_id) paidExpenseIds.add(r.expense_id)
    }
  }

  const payableMap = new Map<string, IAdminAccountPayable>()
  for (const e of expenses) {
    if (e.status !== 'approved' && e.status !== 'imputed') continue
    if (paidExpenseIds.has(e.id)) continue
    const provider = Array.isArray(e.iadmin_providers) ? e.iadmin_providers[0] : e.iadmin_providers
    const providerId = provider?.id ?? e.provider_id ?? null
    const providerName = provider?.name ?? 'Sin proveedor'
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
  const runs = runsRes.data ?? []
  const currentRun = runs.find((r: any) => {
    const p = Array.isArray(r.iadmin_accounting_periods) ? r.iadmin_accounting_periods[0] : r.iadmin_accounting_periods
    return p?.period_year === currentYear && p?.period_month === currentMonth
  })

  const liquidatedOrdinary = currentRun ? Number(currentRun.ordinary_total ?? 0) : 0
  const liquidatedExtraordinary = currentRun ? Number(currentRun.extraordinary_total ?? 0) : 0
  const liquidatedTotal = liquidatedOrdinary + liquidatedExtraordinary

  // Cobranzas reales: sumamos pagos vivos de la run actual
  let collectedTotal = 0
  if (currentRun) {
    const { data: paymentsSum } = await supabase
      .from('iadmin_payments')
      .select('amount')
      .eq('liquidation_run_id', currentRun.id)
      .eq('is_void', false)
    collectedTotal = (paymentsSum ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0)
  }
  collectedTotal = Math.round(collectedTotal * 100) / 100
  const collectedOrdinary = collectedTotal // sin distinguir ord/ext en V1
  const collectedExtraordinary = 0
  const collectionRatePct = liquidatedTotal > 0 ? Math.round((collectedTotal / liquidatedTotal) * 100) : null

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
      ? `${String((Array.isArray(currentRun.iadmin_accounting_periods) ? currentRun.iadmin_accounting_periods[0] : currentRun.iadmin_accounting_periods)?.period_month ?? 0).padStart(2, '0')}/${(Array.isArray(currentRun.iadmin_accounting_periods) ? currentRun.iadmin_accounting_periods[0] : currentRun.iadmin_accounting_periods)?.period_year ?? ''}`
      : null,
    placeholder: false,
  }

  // ---- Deudas de vecinos reales ----
  // Por cada run issued/closed (excepto el mes actual), restamos los pagos vivos.
  const overdueBuckets: IAdminOverdueBucket[] = []
  const historicalRuns = runs.filter((r: any) => {
    if (r.status === 'calculated') return false
    const p = Array.isArray(r.iadmin_accounting_periods) ? r.iadmin_accounting_periods[0] : r.iadmin_accounting_periods
    if (!p) return false
    return !(p.period_year === currentYear && p.period_month === currentMonth)
  })

  if (historicalRuns.length > 0) {
    const runIds = historicalRuns.map((r: any) => r.id)
    const { data: paymentsRows } = await supabase
      .from('iadmin_payments')
      .select('liquidation_run_id, liquidation_item_id, amount')
      .in('liquidation_run_id', runIds)
      .eq('is_void', false)

    const paidByRun = new Map<string, number>()
    const unitsWithDebtByRun = new Map<string, Set<string>>()
    const paidByItem = new Map<string, number>()
    for (const p of paymentsRows ?? []) {
      const key = p.liquidation_run_id as string
      paidByRun.set(key, (paidByRun.get(key) ?? 0) + Number(p.amount))
      if (p.liquidation_item_id) {
        paidByItem.set(p.liquidation_item_id as string, (paidByItem.get(p.liquidation_item_id as string) ?? 0) + Number(p.amount))
      }
    }

    for (const run of historicalRuns) {
      const period = Array.isArray(run.iadmin_accounting_periods) ? run.iadmin_accounting_periods[0] : run.iadmin_accounting_periods
      if (!period) continue
      const items = Array.isArray(run.iadmin_liquidation_items) ? run.iadmin_liquidation_items : []
      let runDebt = 0
      let unitsOwing = 0
      for (const it of items) {
        const subtotal = Number(it.ordinary_amount ?? 0) + Number(it.extraordinary_amount ?? 0) + Number(it.previous_balance ?? 0)
        const paid = paidByItem.get(it.id as string) ?? 0
        const debt = Math.max(0, subtotal - paid)
        if (debt > 0) {
          runDebt += debt
          unitsOwing += 1
        }
      }
      void paidByRun // ya usado via paidByItem
      unitsWithDebtByRun.set(run.id, new Set())
      if (runDebt <= 0) continue
      const periodDate = new Date(period.period_year, period.period_month - 1, 1)
      const today = new Date(currentYear, currentMonth - 1, 1)
      const periodsOld = Math.max(1, (today.getFullYear() - periodDate.getFullYear()) * 12 + (today.getMonth() - periodDate.getMonth()))
      overdueBuckets.push({
        periodLabel: periodLabelFromDate(period.period_year, period.period_month),
        periodsOld,
        unitsCount: unitsOwing,
        totalAmount: Math.round(runDebt * 100) / 100,
      })
    }
  }
  // ordenar por mas viejo primero
  overdueBuckets.sort((a, b) => b.periodsOld - a.periodsOld)
  const totalOverdueAmount = overdueBuckets.reduce((s, b) => s + b.totalAmount, 0)
  const totalOverdueUnits = overdueBuckets.reduce((s, b) => s + b.unitsCount, 0)

  // ---- KPIs secundarios ----
  const pendingExpenses = expenses.filter((e: any) => e.status === 'pending_review' || e.status === 'needs_doc').length

  const pendingDocsRes = await supabase
    .from('iadmin_ai_document_extractions')
    .select('id, iadmin_expense_documents!inner(iadmin_expenses!inner(managed_property_id))', {
      count: 'exact',
      head: true,
    })
    .in('status', ['pending', 'suggested'])
    .eq('iadmin_expense_documents.iadmin_expenses.managed_property_id', propertyId)

  const pendingDocuments = pendingDocsRes.count ?? 0
  const activeUnitsCount = (unitsRes.data ?? []).length

  const { count: recurringCount } = await supabase
    .from('iadmin_providers')
    .select('id', { count: 'exact', head: true })
    .eq('administration_id', administrationId)
    .eq('is_recurring', true)
    .eq('is_active', true)

  void periodRes // reservado para futura integracion con periodo actual

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
    recurringProvidersCount: recurringCount ?? 0,
  }
}

export async function getIAdminReminders(
  administrationId: string,
  options: { status?: IAdminReminderStatus | 'all'; limit?: number } = {},
): Promise<IAdminReminder[]> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return []

  let query = supabase
    .from('iadmin_reminders')
    .select(`
      *,
      iadmin_managed_properties(display_name, buildings(name)),
      iadmin_liquidation_items!inner(
        iadmin_units(code, iadmin_unit_holders(full_name, phone, email, is_active)),
        iadmin_liquidation_runs(id)
      ),
      iadmin_item_share_tokens(token)
    `)
    .eq('administration_id', administrationId)
    .order('generated_at', { ascending: false })
    .limit(options.limit ?? 200)

  if (options.status && options.status !== 'all') {
    query = query.eq('status', options.status)
  }

  const { data } = await query

  return (data ?? []).map((row: any): IAdminReminder => {
    const property = Array.isArray(row.iadmin_managed_properties) ? row.iadmin_managed_properties[0] : row.iadmin_managed_properties
    const building = property?.buildings
      ? Array.isArray(property.buildings)
        ? property.buildings[0]
        : property.buildings
      : null
    const item = Array.isArray(row.iadmin_liquidation_items) ? row.iadmin_liquidation_items[0] : row.iadmin_liquidation_items
    const unit = item?.iadmin_units ? (Array.isArray(item.iadmin_units) ? item.iadmin_units[0] : item.iadmin_units) : null
    const holders = Array.isArray(unit?.iadmin_unit_holders) ? unit.iadmin_unit_holders : []
    const holder = holders.find((h: any) => h?.is_active) ?? holders[0] ?? null
    const tokens = Array.isArray(row.iadmin_item_share_tokens) ? row.iadmin_item_share_tokens : []
    const firstToken = tokens[0]?.token ?? null
    const base = process.env.NEXT_PUBLIC_APP_BASE_URL ?? ''
    const shareUrl = firstToken ? `${base}/l/${firstToken}` : null

    return {
      id: row.id,
      administrationId: row.administration_id,
      managedPropertyId: row.managed_property_id ?? null,
      propertyName: property?.display_name ?? building?.name ?? null,
      liquidationItemId: row.liquidation_item_id,
      unitCode: unit?.code ?? '—',
      holderName: holder?.full_name ?? null,
      holderPhone: holder?.phone ?? null,
      holderEmail: holder?.email ?? null,
      reminderKind: row.reminder_kind,
      status: row.status,
      messageBody: row.message_body ?? null,
      amountDue: row.amount_due !== null && row.amount_due !== undefined ? Number(row.amount_due) : null,
      dueLabel: row.due_label ?? null,
      dueDate: row.due_date ?? null,
      generatedAt: row.generated_at,
      sentAt: row.sent_at ?? null,
      dismissedAt: row.dismissed_at ?? null,
      shareUrl,
    }
  })
}

export async function getIAdminPortfolioOverview(administrationId: string): Promise<IAdminPortfolioOverview | null> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: admin } = await supabase
    .from('iadmin_administrations')
    .select('*')
    .eq('id', administrationId)
    .maybeSingle()
  if (!admin) return null

  const { data: propsData } = await supabase
    .from('iadmin_managed_properties')
    .select('*, buildings(id, name, address, total_units)')
    .eq('administration_id', administrationId)
    .eq('is_active', true)
    .order('created_at')

  const properties = (propsData ?? []).map(mapManagedProperty)
  const propertyIds = properties.map((p) => p.id)
  if (propertyIds.length === 0) {
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
      rows: [],
      totals: {
        totalBalance: 0,
        totalOverdue: 0,
        totalPayable: 0,
        totalLiquidatedMonth: 0,
        totalCollectedMonth: 0,
        pendingExpenses: 0,
      },
    }
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // ---- Saldos por cuenta ----
  const { data: accounts } = await supabase
    .from('iadmin_cash_accounts')
    .select('id, managed_property_id, is_active')
    .in('managed_property_id', propertyIds)
    .eq('is_active', true)
  const activeAccountIds = (accounts ?? []).map((a: any) => a.id)
  const accountProperty = new Map<string, string>()
  for (const a of accounts ?? []) accountProperty.set(a.id, a.managed_property_id)

  const balanceByProperty = new Map<string, number>()
  if (activeAccountIds.length > 0) {
    const { data: moves } = await supabase
      .from('iadmin_bank_movements')
      .select('cash_account_id, amount')
      .in('cash_account_id', activeAccountIds)
    for (const m of moves ?? []) {
      const pid = accountProperty.get(m.cash_account_id)
      if (!pid) continue
      balanceByProperty.set(pid, (balanceByProperty.get(pid) ?? 0) + Number(m.amount))
    }
  }

  // ---- Gastos por property: pendientes + approved (deuda a proveedor) ----
  const { data: expensesRows } = await supabase
    .from('iadmin_expenses')
    .select('id, managed_property_id, status, amount')
    .in('managed_property_id', propertyIds)

  const paidExpenseIds = new Set<string>()
  if ((expensesRows ?? []).length > 0) {
    const { data: payRows } = await supabase
      .from('iadmin_bank_movements')
      .select('expense_id')
      .eq('movement_kind', 'expense_payment')
      .in('expense_id', (expensesRows ?? []).map((e: any) => e.id))
    for (const r of payRows ?? []) {
      if (r.expense_id) paidExpenseIds.add(r.expense_id as string)
    }
  }

  const pendingByProperty = new Map<string, number>()
  const payableByProperty = new Map<string, number>()
  for (const e of expensesRows ?? []) {
    if (e.status === 'pending_review' || e.status === 'needs_doc') {
      pendingByProperty.set(e.managed_property_id, (pendingByProperty.get(e.managed_property_id) ?? 0) + 1)
    }
    if ((e.status === 'approved' || e.status === 'imputed') && !paidExpenseIds.has(e.id)) {
      payableByProperty.set(
        e.managed_property_id,
        (payableByProperty.get(e.managed_property_id) ?? 0) + Number(e.amount),
      )
    }
  }

  // ---- Liquidations + pagos ----
  const { data: runs } = await supabase
    .from('iadmin_liquidation_runs')
    .select(`
      id, managed_property_id, status, ordinary_total, extraordinary_total,
      iadmin_accounting_periods(period_year, period_month),
      iadmin_liquidation_items(id, ordinary_amount, extraordinary_amount, previous_balance)
    `)
    .in('managed_property_id', propertyIds)
    .in('status', ['calculated', 'issued', 'closed'])

  const runsByProperty = new Map<string, any[]>()
  for (const r of runs ?? []) {
    const arr = runsByProperty.get(r.managed_property_id) ?? []
    arr.push(r)
    runsByProperty.set(r.managed_property_id, arr)
  }

  // Payments vivos por run
  const runIds = (runs ?? []).map((r: any) => r.id)
  const paymentsByRun = new Map<string, number>()
  const paymentsByItem = new Map<string, number>()
  if (runIds.length > 0) {
    const { data: payments } = await supabase
      .from('iadmin_payments')
      .select('liquidation_run_id, liquidation_item_id, amount')
      .in('liquidation_run_id', runIds)
      .eq('is_void', false)
    for (const p of payments ?? []) {
      if (p.liquidation_run_id) {
        paymentsByRun.set(p.liquidation_run_id, (paymentsByRun.get(p.liquidation_run_id) ?? 0) + Number(p.amount))
      }
      if (p.liquidation_item_id) {
        paymentsByItem.set(p.liquidation_item_id, (paymentsByItem.get(p.liquidation_item_id) ?? 0) + Number(p.amount))
      }
    }
  }

  // ---- Periodos abiertos ----
  const { data: openPeriods } = await supabase
    .from('iadmin_accounting_periods')
    .select('managed_property_id, period_year, period_month, status')
    .in('managed_property_id', propertyIds)
    .eq('period_year', currentYear)
    .eq('period_month', currentMonth)
  const openPeriodByProperty = new Set(
    (openPeriods ?? []).filter((p: any) => p.status === 'open').map((p: any) => p.managed_property_id),
  )

  // Armar filas
  const rows: IAdminPortfolioPropertyRow[] = properties.map((property) => {
    const runsOfProperty = runsByProperty.get(property.id) ?? []
    const currentRun = runsOfProperty.find((r) => {
      const p = Array.isArray(r.iadmin_accounting_periods) ? r.iadmin_accounting_periods[0] : r.iadmin_accounting_periods
      return p?.period_year === currentYear && p?.period_month === currentMonth
    })
    const historicalRuns = runsOfProperty.filter((r) => {
      if (r.status === 'calculated') return false
      const p = Array.isArray(r.iadmin_accounting_periods) ? r.iadmin_accounting_periods[0] : r.iadmin_accounting_periods
      return !(p?.period_year === currentYear && p?.period_month === currentMonth)
    })

    // overdueAmount: suma (subtotal - cobrado) por item de runs historicas issued/closed
    let overdue = 0
    for (const r of historicalRuns) {
      const items = Array.isArray(r.iadmin_liquidation_items) ? r.iadmin_liquidation_items : []
      for (const it of items) {
        const subtotal =
          Number(it.ordinary_amount ?? 0) + Number(it.extraordinary_amount ?? 0) + Number(it.previous_balance ?? 0)
        const paid = paymentsByItem.get(it.id) ?? 0
        overdue += Math.max(0, subtotal - paid)
      }
    }

    const liquidated = currentRun
      ? Number(currentRun.ordinary_total ?? 0) + Number(currentRun.extraordinary_total ?? 0)
      : 0
    const collected = currentRun ? paymentsByRun.get(currentRun.id) ?? 0 : 0
    const rate = liquidated > 0 ? Math.round((collected / liquidated) * 100) : null

    const alerts: string[] = []
    if (!openPeriodByProperty.has(property.id) && !currentRun) {
      alerts.push('Sin período abierto')
    }
    if (pendingByProperty.get(property.id) ?? 0 > 0) {
      alerts.push(`${pendingByProperty.get(property.id)} gastos a revisar`)
    }
    if (rate !== null && rate < 50) {
      alerts.push(`Cobranza baja (${rate}%)`)
    }
    if ((balanceByProperty.get(property.id) ?? 0) < 0) {
      alerts.push('Saldo negativo')
    }

    return {
      property,
      totalBalance: Math.round((balanceByProperty.get(property.id) ?? 0) * 100) / 100,
      pendingExpenses: pendingByProperty.get(property.id) ?? 0,
      accountsPayableTotal: Math.round((payableByProperty.get(property.id) ?? 0) * 100) / 100,
      overdueAmount: Math.round(overdue * 100) / 100,
      currentMonthLiquidated: Math.round(liquidated * 100) / 100,
      currentMonthCollected: Math.round(collected * 100) / 100,
      collectionRatePct: rate,
      hasOpenPeriod: openPeriodByProperty.has(property.id),
      runStatusThisMonth: currentRun?.status ?? null,
      alerts,
    }
  })

  const totals = {
    totalBalance: rows.reduce((s, r) => s + r.totalBalance, 0),
    totalOverdue: rows.reduce((s, r) => s + r.overdueAmount, 0),
    totalPayable: rows.reduce((s, r) => s + r.accountsPayableTotal, 0),
    totalLiquidatedMonth: rows.reduce((s, r) => s + r.currentMonthLiquidated, 0),
    totalCollectedMonth: rows.reduce((s, r) => s + r.currentMonthCollected, 0),
    pendingExpenses: rows.reduce((s, r) => s + r.pendingExpenses, 0),
  }

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
    rows: rows.map((r) => ({
      ...r,
      totalBalance: Math.round(r.totalBalance * 100) / 100,
      overdueAmount: Math.round(r.overdueAmount * 100) / 100,
    })),
    totals: {
      totalBalance: Math.round(totals.totalBalance * 100) / 100,
      totalOverdue: Math.round(totals.totalOverdue * 100) / 100,
      totalPayable: Math.round(totals.totalPayable * 100) / 100,
      totalLiquidatedMonth: Math.round(totals.totalLiquidatedMonth * 100) / 100,
      totalCollectedMonth: Math.round(totals.totalCollectedMonth * 100) / 100,
      pendingExpenses: totals.pendingExpenses,
    },
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
  const supabase = await getSupabaseServerClient()
  if (!supabase) return []

  const { data: accounts } = await supabase
    .from('iadmin_cash_accounts')
    .select('*')
    .eq('managed_property_id', propertyId)
    .order('is_active', { ascending: false })
    .order('created_at')

  if (!accounts || accounts.length === 0) return []

  const accountIds = accounts.map((a: any) => a.id)

  // Traemos todos los movimientos de esas cuentas y calculamos sumas
  const { data: moves } = await supabase
    .from('iadmin_bank_movements')
    .select('cash_account_id, amount')
    .in('cash_account_id', accountIds)

  const sumByAccount = new Map<string, { sum: number; count: number }>()
  for (const m of moves ?? []) {
    const existing = sumByAccount.get(m.cash_account_id) ?? { sum: 0, count: 0 }
    existing.sum += Number(m.amount)
    existing.count += 1
    sumByAccount.set(m.cash_account_id, existing)
  }

  return accounts.map((row: any): IAdminCashAccountWithBalance => {
    const base = mapCashAccount(row)
    const sum = sumByAccount.get(base.id) ?? { sum: 0, count: 0 }
    return {
      ...base,
      currentBalance: Math.round(sum.sum * 100) / 100,
      movementsCount: sum.count,
    }
  })
}

export async function getIAdminCashMovements(
  propertyId: string,
  options: { accountId?: string; limit?: number } = {},
): Promise<IAdminCashMovement[]> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return []

  let query = supabase
    .from('iadmin_bank_movements')
    .select(`
      *,
      iadmin_cash_accounts ( id, name ),
      iadmin_expenses ( id, description )
    `)
    .eq('managed_property_id', propertyId)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 100)

  if (options.accountId) {
    query = query.eq('cash_account_id', options.accountId)
  }

  const { data } = await query

  return (data ?? []).map((row: any): IAdminCashMovement => {
    const account = Array.isArray(row.iadmin_cash_accounts) ? row.iadmin_cash_accounts[0] : row.iadmin_cash_accounts
    const expense = Array.isArray(row.iadmin_expenses) ? row.iadmin_expenses[0] : row.iadmin_expenses
    return {
      id: row.id,
      cashAccountId: row.cash_account_id ?? null,
      cashAccountName: account?.name ?? null,
      administrationId: row.administration_id,
      managedPropertyId: row.managed_property_id ?? null,
      movementDate: row.movement_date,
      description: row.description ?? null,
      amount: Number(row.amount),
      balance: row.balance !== null && row.balance !== undefined ? Number(row.balance) : null,
      externalRef: row.external_ref ?? null,
      movementKind: (row.movement_kind ?? 'manual') as IAdminCashMovement['movementKind'],
      expenseId: row.expense_id ?? null,
      expenseDescription: expense?.description ?? null,
      createdAt: row.created_at,
    }
  })
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
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: property } = await supabase
    .from('iadmin_managed_properties')
    .select('id, administration_id')
    .eq('id', propertyId)
    .maybeSingle()
  if (!property) return null

  // Buscar periodo
  const { data: period } = await supabase
    .from('iadmin_accounting_periods')
    .select('id')
    .eq('managed_property_id', propertyId)
    .eq('period_year', year)
    .eq('period_month', month)
    .maybeSingle()

  // Unidades activas con alicuota
  const { data: unitsRaw } = await supabase
    .from('iadmin_units')
    .select('id, code, kind, prorata_coefficient, iadmin_unit_holders(full_name, phone, is_active)')
    .eq('managed_property_id', propertyId)
    .eq('is_active', true)
    .order('code')

  const units = (unitsRaw ?? []).filter((u: any) => u.prorata_coefficient !== null)
  const alicuotaSum = units.reduce((s, u: any) => s + Number(u.prorata_coefficient), 0)
  const coverageOk = Math.abs(alicuotaSum - 1) < 0.001
  const coverageDeltaPct = Math.round((alicuotaSum - 1) * 10000) / 100

  // Si existe run para el periodo, usamos sus items
  let existingRun: any = null
  if (period) {
    const { data: run } = await supabase
      .from('iadmin_liquidation_runs')
      .select('id, status, ordinary_total, extraordinary_total, previous_balance, due_dates, iadmin_liquidation_items(id, unit_id, ordinary_amount, extraordinary_amount, previous_balance)')
      .eq('managed_property_id', propertyId)
      .eq('accounting_period_id', period.id)
      .maybeSingle()
    existingRun = run ?? null
  }

  // Calcular totales ord/ext del periodo actual (fuentes de verdad = gastos imputed)
  let ordinaryTotal = 0
  let extraordinaryTotal = 0
  if (period) {
    const { data: expensesRows } = await supabase
      .from('iadmin_expenses')
      .select('amount, expense_kind')
      .eq('managed_property_id', propertyId)
      .eq('accounting_period_id', period.id)
      .eq('status', 'imputed')
    for (const e of expensesRows ?? []) {
      const amt = Number(e.amount)
      if ((e.expense_kind ?? 'ordinaria') === 'extraordinaria') extraordinaryTotal += amt
      else ordinaryTotal += amt
    }
  }
  ordinaryTotal = Math.round(ordinaryTotal * 100) / 100
  extraordinaryTotal = Math.round(extraordinaryTotal * 100) / 100

  // Saldo anterior por unidad (si hay run previo)
  const previousBalanceByUnit = new Map<string, number>()
  if (existingRun) {
    for (const it of existingRun.iadmin_liquidation_items ?? []) {
      if (it.previous_balance) previousBalanceByUnit.set(it.unit_id, Number(it.previous_balance))
    }
  } else {
    const { data: priorRunsData } = await supabase
      .from('iadmin_liquidation_runs')
      .select('id, iadmin_liquidation_items(id, unit_id, ordinary_amount, extraordinary_amount, previous_balance)')
      .eq('managed_property_id', propertyId)
      .neq('accounting_period_id', period?.id ?? '00000000-0000-0000-0000-000000000000')
      .in('status', ['issued', 'closed'])
      .order('generated_at', { ascending: false })
      .limit(1)
    const priorRun = priorRunsData?.[0]
    if (priorRun) {
      const priorItems = Array.isArray(priorRun.iadmin_liquidation_items) ? priorRun.iadmin_liquidation_items : []
      const priorItemIds = priorItems.map((it: any) => it.id)
      const paidByItem = new Map<string, number>()
      if (priorItemIds.length > 0) {
        const { data: priorPayments } = await supabase
          .from('iadmin_payments')
          .select('liquidation_item_id, amount')
          .in('liquidation_item_id', priorItemIds)
          .eq('is_void', false)
        for (const p of priorPayments ?? []) {
          if (!p.liquidation_item_id) continue
          paidByItem.set(p.liquidation_item_id, (paidByItem.get(p.liquidation_item_id) ?? 0) + Number(p.amount))
        }
      }
      for (const it of priorItems) {
        const sub =
          Number(it.ordinary_amount ?? 0) + Number(it.extraordinary_amount ?? 0) + Number(it.previous_balance ?? 0)
        const paid = paidByItem.get(it.id) ?? 0
        const debt = Math.max(0, Math.round((sub - paid) * 100) / 100)
        if (debt > 0) previousBalanceByUnit.set(it.unit_id, debt)
      }
    }
  }

  // Pagos del run actual
  const paidByUnitCurrent = new Map<string, number>()
  if (existingRun) {
    const items = Array.isArray(existingRun.iadmin_liquidation_items) ? existingRun.iadmin_liquidation_items : []
    const itemIds = items.map((it: any) => it.id)
    if (itemIds.length > 0) {
      const { data: payments } = await supabase
        .from('iadmin_payments')
        .select('liquidation_item_id, amount, unit_id')
        .in('liquidation_item_id', itemIds)
        .eq('is_void', false)
      for (const p of payments ?? []) {
        if (!p.unit_id) continue
        paidByUnitCurrent.set(p.unit_id, (paidByUnitCurrent.get(p.unit_id) ?? 0) + Number(p.amount))
      }
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
  const unitLines: IAdminMesaUnitLine[] = units.map((u: any) => {
    const prorata = Number(u.prorata_coefficient)
    const ord = Math.round(ordinaryTotal * prorata * 100) / 100
    const ext = Math.round(extraordinaryTotal * prorata * 100) / 100
    const prev = Math.round((previousBalanceByUnit.get(u.id) ?? 0) * 100) / 100
    const subtotal = Math.round((ord + ext + prev) * 100) / 100
    const collected = Math.round((paidByUnitCurrent.get(u.id) ?? 0) * 100) / 100
    const balance = Math.max(0, Math.round((subtotal - collected) * 100) / 100)
    const holders = Array.isArray(u.iadmin_unit_holders) ? u.iadmin_unit_holders : []
    const holder = holders.find((h: any) => h?.is_active) ?? holders[0] ?? null
    const dueAmounts = dueDates.map((d) => ({
      label: d.label,
      date: d.date,
      amount: Math.round(subtotal * (1 + d.surchargePct / 100) * 100) / 100,
    }))
    return {
      unitId: u.id,
      unitCode: u.code,
      unitKind: u.kind,
      holderName: holder?.full_name ?? null,
      holderPhone: holder?.phone ?? null,
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
    runStatus: existingRun?.status ?? null,
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
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const monthsCount = options.monthsCount ?? 12

  // 1. Unidad + titular activo + property
  const { data: unitRow } = await supabase
    .from('iadmin_units')
    .select('id, code, kind, prorata_coefficient, managed_property_id, iadmin_managed_properties(administration_id), iadmin_unit_holders(full_name, phone, email, is_active)')
    .eq('id', unitId)
    .eq('managed_property_id', propertyId)
    .maybeSingle()
  if (!unitRow) return null

  const property = Array.isArray((unitRow as any).iadmin_managed_properties)
    ? (unitRow as any).iadmin_managed_properties[0]
    : (unitRow as any).iadmin_managed_properties
  const administrationId = property?.administration_id as string | undefined
  if (!administrationId) return null

  const holders = Array.isArray((unitRow as any).iadmin_unit_holders)
    ? ((unitRow as any).iadmin_unit_holders as Array<any>)
    : []
  const holder = holders.find((h) => h?.is_active) ?? holders[0] ?? null

  const prorata = Number((unitRow as any).prorata_coefficient ?? 0)

  // 2. Armar ventana de meses (más viejo al más nuevo)
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

  // 3. Periodos de la ventana
  const { data: periods } = await supabase
    .from('iadmin_accounting_periods')
    .select('id, period_year, period_month, status')
    .eq('managed_property_id', propertyId)
    .in('period_year', yearsInWindow)
  const periodByKey = new Map<string, { id: string; status: any }>()
  for (const p of periods ?? []) {
    periodByKey.set(`${p.period_year}-${p.period_month}`, { id: p.id, status: p.status })
  }
  for (const m of months) {
    const found = periodByKey.get(`${m.year}-${m.month}`)
    if (found) m.periodStatus = found.status as any
  }

  // 4. Runs de la ventana + item de esta unidad por cada run
  const { data: runsData } = await supabase
    .from('iadmin_liquidation_runs')
    .select(`
      id, status, managed_property_id, accounting_period_id,
      iadmin_accounting_periods(period_year, period_month),
      iadmin_liquidation_items(id, unit_id, ordinary_amount, extraordinary_amount, previous_balance)
    `)
    .eq('managed_property_id', propertyId)

  for (const r of runsData ?? []) {
    const p = Array.isArray(r.iadmin_accounting_periods) ? r.iadmin_accounting_periods[0] : r.iadmin_accounting_periods
    if (!p) continue
    const monthTarget = months.find((mm) => mm.year === p.period_year && mm.month === p.period_month)
    if (!monthTarget) continue
    monthTarget.runId = r.id as string
    monthTarget.runStatus = r.status as any
    const items = Array.isArray(r.iadmin_liquidation_items) ? r.iadmin_liquidation_items : []
    const item = items.find((it: any) => it.unit_id === unitId)
    if (item) {
      monthTarget.liquidationItemId = item.id as string
      monthTarget.ordinary = Number(item.ordinary_amount ?? 0)
      monthTarget.extraordinary = Number(item.extraordinary_amount ?? 0)
      monthTarget.previousBalance = Number(item.previous_balance ?? 0)
    }
  }

  // 5. Para meses sin run pero con gastos imputados, calculamos subtotal estimado
  //    usando la prorata sobre el total imputed del mes.
  const missing = months.filter((m) => m.liquidationItemId === null && m.periodStatus !== null)
  if (missing.length > 0) {
    const periodIds = missing.map((m) => periodByKey.get(`${m.year}-${m.month}`)?.id).filter(Boolean) as string[]
    if (periodIds.length > 0) {
      const { data: expensesRows } = await supabase
        .from('iadmin_expenses')
        .select('amount, expense_kind, accounting_period_id')
        .eq('managed_property_id', propertyId)
        .eq('status', 'imputed')
        .in('accounting_period_id', periodIds)
      const byPeriod = new Map<string, { ord: number; ext: number }>()
      for (const e of expensesRows ?? []) {
        const acc = byPeriod.get(e.accounting_period_id as string) ?? { ord: 0, ext: 0 }
        if ((e.expense_kind ?? 'ordinaria') === 'extraordinaria') acc.ext += Number(e.amount)
        else acc.ord += Number(e.amount)
        byPeriod.set(e.accounting_period_id as string, acc)
      }
      for (const m of missing) {
        const pid = periodByKey.get(`${m.year}-${m.month}`)?.id
        if (!pid) continue
        const totals = byPeriod.get(pid)
        if (!totals) continue
        m.ordinary = Math.round(totals.ord * prorata * 100) / 100
        m.extraordinary = Math.round(totals.ext * prorata * 100) / 100
      }
    }
  }

  // 6. Pagos de esta unidad dentro de la ventana
  const { data: paymentsRows } = await supabase
    .from('iadmin_payments')
    .select(`
      id, amount, paid_at, method, reference, receipt_number, due_label,
      surcharge_amount, is_void, notes, liquidation_run_id, liquidation_item_id,
      iadmin_liquidation_runs(
        iadmin_accounting_periods(period_year, period_month)
      )
    `)
    .eq('unit_id', unitId)
    .gte('paid_at', windowStart)
    .order('paid_at', { ascending: false })

  const collectedByItem = new Map<string, number>()
  const paymentsFormatted: IAdminUnitPaymentReceipt[] = []
  for (const row of paymentsRows ?? []) {
    const amount = Number(row.amount ?? 0)
    if (!row.is_void && row.liquidation_item_id) {
      collectedByItem.set(row.liquidation_item_id as string, (collectedByItem.get(row.liquidation_item_id as string) ?? 0) + amount)
    }
    const run = Array.isArray(row.iadmin_liquidation_runs) ? row.iadmin_liquidation_runs[0] : row.iadmin_liquidation_runs
    const runPeriod = run ? (Array.isArray(run.iadmin_accounting_periods) ? run.iadmin_accounting_periods[0] : run.iadmin_accounting_periods) : null
    const periodLabel = runPeriod
      ? `${MONTH_LABELS_SHORT[runPeriod.period_month - 1]} ${String(runPeriod.period_year).slice(2)}`
      : null
    paymentsFormatted.push({
      id: row.id as string,
      receiptNumber: (row.receipt_number as string) ?? null,
      amount,
      paidAt: row.paid_at as string,
      method: (row.method as string) ?? null,
      reference: (row.reference as string) ?? null,
      dueLabel: (row.due_label as string) ?? null,
      surchargeAmount: Number(row.surcharge_amount ?? 0),
      isVoid: Boolean(row.is_void),
      notes: (row.notes as string) ?? null,
      liquidationRunId: (row.liquidation_run_id as string) ?? null,
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
      code: (unitRow as any).code as string,
      kind: (unitRow as any).kind,
      prorataCoefficient: prorata,
      holderName: holder?.full_name ?? null,
      holderPhone: holder?.phone ?? null,
      holderEmail: holder?.email ?? null,
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
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: propertyRow } = await supabase
    .from('iadmin_managed_properties')
    .select('id, administration_id, display_name, buildings(name)')
    .eq('id', propertyId)
    .maybeSingle()
  if (!propertyRow) return null

  const building = propertyRow.buildings
    ? Array.isArray(propertyRow.buildings)
      ? propertyRow.buildings[0]
      : propertyRow.buildings
    : null
  const propertyName = propertyRow.display_name ?? building?.name ?? 'Consorcio'
  const administrationId = propertyRow.administration_id as string

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
  const startDate = new Date(months[0].year, months[0].month - 1, 1).toISOString().slice(0, 10)

  // Períodos de la ventana
  const { data: periodsRows } = await supabase
    .from('iadmin_accounting_periods')
    .select('id, period_year, period_month, status')
    .eq('managed_property_id', propertyId)
    .in('period_year', yearsInWindow)
  const periodMap = new Map<string, { id: string; status: IAdminPeriodStatus }>()
  for (const p of periodsRows ?? []) {
    periodMap.set(`${p.period_year}-${p.period_month}`, { id: p.id, status: p.status })
  }
  for (const m of months) {
    const p = periodMap.get(`${m.year}-${m.month}`)
    m.periodStatus = p?.status ?? null
  }

  // Liquidaciones de la ventana
  const { data: runsRows } = await supabase
    .from('iadmin_liquidation_runs')
    .select('id, managed_property_id, accounting_period_id, status, iadmin_accounting_periods(period_year, period_month)')
    .eq('managed_property_id', propertyId)
  for (const r of runsRows ?? []) {
    const p = Array.isArray(r.iadmin_accounting_periods) ? r.iadmin_accounting_periods[0] : r.iadmin_accounting_periods
    if (!p) continue
    const target = months.find((m) => m.year === p.period_year && m.month === p.period_month)
    if (target) {
      target.runId = r.id
      target.runStatus = r.status
    }
  }

  // Gastos: todos los imputed/approved de esos períodos + los pending_review/draft también
  const { data: expenseRows } = await supabase
    .from('iadmin_expenses')
    .select(`
      id, amount, provider_id, accounting_period_id, status, expense_kind,
      description, issued_at, created_at, updated_at, created_by,
      iadmin_expense_documents(id, file_name, storage_path),
      iadmin_accounting_periods!inner(period_year, period_month)
    `)
    .eq('managed_property_id', propertyId)
    .gte('iadmin_accounting_periods.period_year', months[0].year)

  // Resolver nombres de los "created_by" con una sola consulta a profiles
  const createdByIds = Array.from(
    new Set((expenseRows ?? []).map((e: any) => e.created_by).filter(Boolean) as string[]),
  )
  const profileNameById = new Map<string, string>()
  if (createdByIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', createdByIds)
    for (const p of profiles ?? []) {
      profileNameById.set(p.id, (p as any).full_name || (p as any).email || 'Usuario')
    }
  }

  // Filtramos por la ventana y por status (excluimos rejected)
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
  for (const e of expenseRows ?? []) {
    if (e.status === 'rejected') continue
    const p = Array.isArray(e.iadmin_accounting_periods) ? e.iadmin_accounting_periods[0] : e.iadmin_accounting_periods
    if (!p) continue
    const inWindow = months.some((m) => m.year === p.period_year && m.month === p.period_month)
    if (!inWindow) continue
    const docs = Array.isArray(e.iadmin_expense_documents) ? e.iadmin_expense_documents : []
    const firstDoc = docs[0] ?? null
    expenses.push({
      id: e.id,
      amount: Number(e.amount),
      providerId: e.provider_id ?? null,
      year: p.period_year,
      month: p.period_month,
      hasDocument: docs.length > 0,
      status: e.status as IAdminExpenseStatus,
      description: e.description ?? null,
      issuedAt: e.issued_at ?? null,
      createdAt: e.created_at ?? null,
      updatedAt: e.updated_at ?? null,
      createdByName: e.created_by ? (profileNameById.get(e.created_by) ?? null) : null,
      documentId: firstDoc?.id ?? null,
      documentName: firstDoc?.file_name ?? null,
      documentPath: firstDoc?.storage_path ?? null,
    })
  }

  // Proveedores recurrentes de la administración (rubros fijos)
  const { data: allProviders } = await supabase
    .from('iadmin_providers')
    .select('*')
    .eq('administration_id', administrationId)
    .eq('is_active', true)

  const providers = (allProviders ?? []).map(mapProvider)
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
  const { data: unitsData } = await supabase
    .from('iadmin_units')
    .select('id, prorata_coefficient')
    .eq('managed_property_id', propertyId)
    .eq('is_active', true)
  const activeUnitsCount = (unitsData ?? []).length
  const totalAlicuota = (unitsData ?? []).reduce(
    (s, u: any) => s + (u.prorata_coefficient !== null ? Number(u.prorata_coefficient) : 0),
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
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: property } = await supabase
    .from('iadmin_managed_properties')
    .select('id, administration_id')
    .eq('id', propertyId)
    .maybeSingle()
  if (!property) return null

  const now = new Date()
  const year = options.year ?? now.getFullYear()
  const month = options.month ?? now.getMonth() + 1
  const periodLabel = `${String(month).padStart(2, '0')}/${year}`

  // Periodo del mes
  const { data: period } = await supabase
    .from('iadmin_accounting_periods')
    .select('id, status, period_year, period_month')
    .eq('managed_property_id', propertyId)
    .eq('period_year', year)
    .eq('period_month', month)
    .maybeSingle()

  const periodId = period?.id ?? null
  const periodStatus = (period?.status ?? null) as IAdminClosingChecklist['periodStatus']

  // Gastos del periodo
  let expensesCount = 0
  let pendingReviewCount = 0
  if (periodId) {
    const { data: expenses } = await supabase
      .from('iadmin_expenses')
      .select('id, status')
      .eq('managed_property_id', propertyId)
      .eq('accounting_period_id', periodId)
    for (const e of expenses ?? []) {
      expensesCount += 1
      if (e.status === 'pending_review' || e.status === 'needs_doc') pendingReviewCount += 1
    }
  }

  // Run de esta liquidacion
  let liquidationRunId: string | null = null
  let runStatus: string | null = null
  if (periodId) {
    const { data: run } = await supabase
      .from('iadmin_liquidation_runs')
      .select('id, status')
      .eq('managed_property_id', propertyId)
      .eq('accounting_period_id', periodId)
      .maybeSingle()
    liquidationRunId = run?.id ?? null
    runStatus = run?.status ?? null
  }

  // Recordatorios generados hoy para esta property
  const todayStr = now.toISOString().slice(0, 10)
  const { count: remindersTodayCount } = await supabase
    .from('iadmin_reminders')
    .select('id', { count: 'exact', head: true })
    .eq('managed_property_id', propertyId)
    .gte('generated_at', `${todayStr}T00:00:00Z`)

  const hasReminders = (remindersTodayCount ?? 0) > 0

  // Comunicado: no tenemos tabla dedicada todavia. Tomamos notifications enviados este mes como proxy
  const firstOfMonth = new Date(year, month - 1, 1).toISOString()
  const { count: notificationsCount } = await supabase
    .from('iadmin_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('administration_id', property.administration_id)
    .gte('created_at', firstOfMonth)

  const hasAnnouncement = (notificationsCount ?? 0) > 0

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
