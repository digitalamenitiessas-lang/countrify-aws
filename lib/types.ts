export type UserRole = 'super_admin' | 'negocio_admin' | 'consorcio_admin' | 'propietario' | 'vecino'

export interface Building {
  id: string
  name: string
  address: string
  latitude: number | null
  longitude: number | null
  totalUnits: number
  createdAt: string
}

export interface Profile {
  id: string
  email: string
  fullName: string
  role: UserRole
  avatarText: string
  businessId: string | null
  buildingId: string | null
  floor: string | null
  unit: string | null
  phone: string | null
  createdAt: string
}

export interface Business {
  id: string
  name: string
  category: string
  description: string
  address: string | null
  latitude: number | null
  longitude: number | null
  ownerProfileId: string | null
  logoPath: string | null
  logoUrl: string | null
  createdAt: string
}

export interface Promotion {
  id: string
  businessId: string
  businessName: string
  title: string
  description: string
  discount: string
  category: string
  expirationDate: string
  usageCount: number
  buildingId: string | null
  createdAt: string
  publishedMonth: string
  sourcePromotionId: string | null
  imagePath: string | null
  imageUrl: string | null
  isActive: boolean
}

export interface PromotionMonthlyStatus {
  monthStart: string
  monthLabel: string
  isCompliant: boolean
  promotionsThisMonth: number
  lastMonthPromotion: Promotion | null
  isAutoRenewed: boolean
  autoRenewedPromotion: Promotion | null
}

export interface PromotionRedemptionToken {
  id: string
  token: string
  qrValue: string
  expiresAt: string
  promotionId: string
  promotionTitle: string
  businessName: string
}

export type PromotionRedemptionValidationStatus =
  | 'redeemed'
  | 'already_used'
  | 'expired'
  | 'not_found'
  | 'promotion_unavailable'
  | 'forbidden'

export interface PromotionRedemptionValidationResult {
  status: PromotionRedemptionValidationStatus
  message: string
  tokenId: string | null
  promotionId: string | null
  promotionTitle: string | null
  neighborName: string | null
  redeemedAt: string | null
}

export interface PromotionRedemptionHistoryItem {
  id: string
  promotionId: string
  promotionTitle: string
  promotionDiscount: string | null
  profileId: string
  neighborName: string
  neighborUnitLabel: string | null
  buildingName: string | null
  status: string
  redeemedAt: string
  createdAt: string
}

export type UnitProfileRelationship = 'propietario' | 'vecino_principal' | 'vecino_adicional'

export interface UnitProfileMembership {
  id: string
  unitId: string
  buildingId: string
  profileId: string
  relationshipType: UnitProfileRelationship
  isPrimary: boolean
  active: boolean
  createdByProfileId: string | null
  createdAt: string
  unitCode: string | null
  unitFloor: string | null
  buildingName: string | null
  profile: Profile | null
}

export type BuildingInformationVisibility = 'residentes' | 'vecinos' | 'propietarios'

export interface BuildingInformationItem {
  id: string
  buildingId: string
  title: string
  category: string
  content: string
  visibleTo: BuildingInformationVisibility
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type BusinessDashboardSection = 'home' | 'promotions' | 'scanner' | 'history' | 'profile'

export type BusinessScannerState =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'unsupported'
  | 'permission_denied'
  | 'validating'
  | 'error'

export type MarketplaceCondition = 'Nuevo' | 'Como Nuevo' | 'Buen Estado' | 'Usado'

export interface MarketplaceItem {
  id: string
  title: string
  description: string
  price: number
  condition: MarketplaceCondition
  sellerId: string
  sellerName: string
  sellerAvatar: string
  sellerPhone: string | null
  buildingId: string
  createdAt: string
  imagePath: string | null
  imageUrl: string | null
  isActive: boolean
}

export type ComplaintCaseStatus = 'nuevo' | 'en_revision' | 'en_desarrollo' | 'en_espera' | 'resuelto' | 'cerrado'
export type ComplaintCaseEventType = 'created' | 'status_changed' | 'message_posted' | 'resolved' | 'closed' | 'migrated'
export type ComplaintCaseMessageType = 'comment' | 'status_note'
export type ComplaintMessageActorRole = 'vecino' | 'consorcio' | 'super_admin' | 'sistema'
export type ComplaintCaseSection = 'summary' | 'forum' | 'events'

export interface ComplaintReason {
  id: string
  slug: string
  label: string
  description: string | null
  isOther: boolean
  createdAt: string
}

export interface ComplaintCaseReasonSelection {
  id: string
  slug: string
  label: string
  isOther: boolean
}

export interface ComplaintCaseListItem {
  id: string
  caseCode: string
  buildingId: string
  buildingName: string
  title: string
  status: ComplaintCaseStatus
  createdAt: string
  updatedAt: string
  lastEventAt: string
  lastEventSummary: string | null
  reasons: ComplaintCaseReasonSelection[]
  otherReasonText: string | null
  messageCount: number
  eventCount: number
  canReply: boolean
  canChangeStatus: boolean
}

export interface ComplaintCaseEvent {
  id: string
  caseId: string
  eventType: ComplaintCaseEventType
  actorLabel: string
  actorRole: ComplaintMessageActorRole
  summary: string
  metadata: Record<string, string | number | boolean | null> | null
  createdAt: string
}

export interface ComplaintCaseMessageMention {
  id: string
  messageId: string
  mentionedProfileId: string
  label: string
}

export interface ComplaintCaseMentionableUser {
  profileId: string
  fullName: string
  role: UserRole
  unitLabel: string | null
  buildingId: string
  label: string
}

export interface ComplaintCaseMessageView {
  id: string
  caseId: string
  message: string
  messageType: ComplaintCaseMessageType
  authorLabel: string
  authorRole: ComplaintMessageActorRole
  mentions: ComplaintCaseMessageMention[]
  createdAt: string
}

export interface ComplaintCaseAuthorInfo {
  profileId: string
  fullName: string
  email: string
  avatarText: string
  unitLabel: string | null
}

export interface ComplaintCaseBaseDetail {
  id: string
  caseCode: string
  buildingId: string
  buildingName: string
  title: string
  description: string
  status: ComplaintCaseStatus
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  closedAt: string | null
  otherReasonText: string | null
  reasons: ComplaintCaseReasonSelection[]
  messages: ComplaintCaseMessageView[]
  events: ComplaintCaseEvent[]
  mentionableUsers: ComplaintCaseMentionableUser[]
  canReply: boolean
  canChangeStatus: boolean
  defaultSection?: ComplaintCaseSection
}

export interface ComplaintCaseDetailNeighborView extends ComplaintCaseBaseDetail {}

export interface ComplaintCaseDetailConsorcioView extends ComplaintCaseBaseDetail {
  author: ComplaintCaseAuthorInfo
}

export interface ComplaintCaseSummaryByBuilding {
  buildingId: string
  buildingName: string
  total: number
  nuevo: number
  enRevision: number
  enDesarrollo: number
  enEspera: number
  resuelto: number
  cerrado: number
}

export interface ComplaintCaseSummaryByReason {
  reasonId: string
  reasonLabel: string
  count: number
}

export interface HomeData {
  promotions: Promotion[]
}

export interface PromotionsPageData {
  promotions: Promotion[]
}

export interface BusinessDashboardData {
  business: Business | null
  promotions: Promotion[]
  consumersCount: number
  availableBuildings: Building[]
  monthlyStatus: PromotionMonthlyStatus | null
  redemptionHistory: PromotionRedemptionHistoryItem[]
}

export interface BuildingAdminAssignment {
  id: string
  profileId: string
  buildingId: string
  isPrimary: boolean
  createdAt: string
}

export interface ConsorcioManagedBuilding {
  building: Building
  neighbors: Profile[]
  registeredNeighbors: number
  occupancyRate: number
  complaintMentionableUsers: ComplaintCaseMentionableUser[]
  complaintCases: ComplaintCaseListItem[]
  complaintCaseDetails: ComplaintCaseDetailConsorcioView[]
  complaintSummary: ComplaintCaseSummaryByBuilding
  reasonSummary: ComplaintCaseSummaryByReason[]
}

export interface ConsorcioDashboardData {
  managedBuildings: ConsorcioManagedBuilding[]
  assignments: BuildingAdminAssignment[]
  primaryBuildingId: string | null
  totalBuildings: number
  totalUnits: number
  totalNeighbors: number
  averageOccupancyRate: number
  totalComplaintCases: number
  complaintSummaries: ComplaintCaseSummaryByBuilding[]
  complaintReasonSummaries: ComplaintCaseSummaryByReason[]
}

export interface ConsorcioAdminInfo {
  profileId: string
  fullName: string
  email: string
  phone: string | null
  isPrimary: boolean
}

export interface SuperAdminBuildingDetail extends Building {
  admins: ConsorcioAdminInfo[]
  neighbors: Profile[]
  registeredNeighbors: number
  occupancyRate: number
  administration: IAdminAdministration | null
  managedProperty: IAdminManagedProperty | null
}

export interface PromotionRedemptionByBuilding {
  buildingId: string
  buildingName: string
  count: number
}

export interface SuperAdminPromotionDetail extends Promotion {
  redemptionsByBuilding: PromotionRedemptionByBuilding[]
}

export interface SuperAdminBusinessDetail extends Business {
  ownerEmail: string | null
  promotions: SuperAdminPromotionDetail[]
  totalRedemptions: number
  topBuilding: string | null
  monthlyStatus: PromotionMonthlyStatus | null
}

export interface SuperAdminConsorcioAdminOption {
  profileId: string
  fullName: string
  email: string
  phone: string | null
  assignedBuildingsCount: number
  primaryBuildingName: string | null
  assignedBuildingNames: string[]
}

export interface SuperAdminDashboardData {
  buildings: SuperAdminBuildingDetail[]
  users: Profile[]
  businesses: SuperAdminBusinessDetail[]
  promotions: SuperAdminPromotionDetail[]
  consorcioAdminOptions: SuperAdminConsorcioAdminOption[]
}

export interface SuperAdminCreateManagedPropertyInput {
  building: {
    name: string
    address: string
    totalUnits: number
    latitude?: number | null
    longitude?: number | null
  }
  administration: {
    name: string
    legalName?: string | null
    taxId?: string | null
    contactEmail?: string | null
    contactPhone?: string | null
  }
  managedProperty: {
    displayName?: string | null
    propertyKind: IAdminPropertyKind
    taxId?: string | null
    managedSince?: string | null
    managementFeePct?: number | null
    notes?: string | null
  }
  adminProfileId: string
}

export interface SuperAdminCreateManagedPropertyResult {
  buildingId: string
  administrationId: string
  managedPropertyId: string
}

export type InitialOccupancyImportRowStatus = 'ready' | 'pending' | 'error'
export type InitialOccupancyUnitDecision = 'reuse' | 'create' | 'unresolved'

export interface InitialOccupancyImportRowDraft {
  id: string
  sourceSheet: string
  sourceRowNumber: number
  status: InitialOccupancyImportRowStatus
  statusReason: string | null
  confidence: number
  fullName: string
  email: string
  phone: string
  unitCode: string
  floor: string | null
  relationshipType: UnitProfileRelationship
  isPrimary: boolean
  unitKind: IAdminUnitKind
  existingUnitId: string | null
  unitDecision: InitialOccupancyUnitDecision
  rawPreview: string
}

export interface InitialOccupancyImportPreviewSummary {
  totalRows: number
  readyRows: number
  pendingRows: number
  errorRows: number
  unitsToCreate: number
  unitsToReuse: number
  usersToCreateEstimate: number
  membershipsToUpsert: number
}

export interface InitialOccupancyImportPreview {
  buildingId: string
  buildingName: string
  fileName: string
  detectedColumns: Record<string, string | null>
  warnings: string[]
  rows: InitialOccupancyImportRowDraft[]
  summary: InitialOccupancyImportPreviewSummary
}

export interface InitialOccupancyImportConfirmResult {
  createdUsers: number
  createdUnits: number
  linkedMemberships: number
  updatedMemberships: number
  errors: string[]
}

export interface ConsumerDashboardData {
  building: Building | null
  businesses: Business[]
  promotions: Promotion[]
  marketplaceItems: MarketplaceItem[]
  savedPromotionIds: string[]
  usedPromotionIds: string[]
  unitMemberships: UnitProfileMembership[]
  householdMembers: UnitProfileMembership[]
  buildingInformation: BuildingInformationItem[]
  complaintReasons: ComplaintReason[]
  complaintMentionableUsers: ComplaintCaseMentionableUser[]
  complaintCases: ComplaintCaseListItem[]
  complaintCaseDetails: ComplaintCaseDetailNeighborView[]
}

export interface OwnerUnitSummary {
  membership: UnitProfileMembership
  latestLiquidation: IAdminLiquidationItem | null
  payments: IAdminPayment[]
}

export interface OwnerDashboardData {
  profile: Profile
  units: OwnerUnitSummary[]
  buildingInformation: BuildingInformationItem[]
}

export type ComplaintStatus = 'sin_completar' | 'en_desarrollo' | 'resuelto'

export interface NeighborComplaintView {
  id: string
  buildingId: string
  title: string
  description: string
  status: ComplaintStatus
  isAnonymous: boolean
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  authorLabel: string
  authorUnit: string | null
}

// ----------------------------------------------------------------------------
// IAdmin (backoffice administrativo de consorcios)
// ----------------------------------------------------------------------------

export type IAdminPropertyKind = 'consorcio' | 'barrio_privado' | 'edificio' | 'mixto'
export type IAdminUnitKind = 'departamento' | 'casa' | 'local' | 'cochera' | 'baulera' | 'otro'
export type IAdminHolderKind = 'propietario' | 'inquilino' | 'apoderado' | 'otro'
export type IAdminPeriodStatus = 'open' | 'locked' | 'closed'
export type IAdminExpenseStatus = 'draft' | 'pending_review' | 'needs_doc' | 'approved' | 'rejected' | 'imputed'
export type IAdminExpenseKind = 'ordinaria' | 'extraordinaria'
export type IAdminAIExtractionStatus = 'pending' | 'suggested' | 'validated' | 'rejected'
export type IAdminLiquidationStatus = 'draft' | 'calculated' | 'issued' | 'closed'

export type IAdminOperationalRole = 'titular' | 'contable' | 'asistente' | 'documental'

export type IAdminCapability =
  | 'portfolio.view'
  | 'consorcio.view'
  | 'consorcio.edit'
  | 'consorcio.legal.edit'
  | 'units.manage'
  | 'unit_groups.manage'
  | 'holders.manage'
  | 'providers.manage'
  | 'expenses.view'
  | 'expenses.create'
  | 'expenses.approve'
  | 'expenses.mark_paid'
  | 'documents.upload'
  | 'documents.validate'
  | 'liquidations.view'
  | 'liquidations.create'
  | 'liquidations.close'
  | 'collections.view'
  | 'communications.send'
  | 'reports.view'
  | 'reports.sensitive.view'
  | 'admin.legal.edit'
  | 'admin.settings.manage'
  | 'cash_accounts.view'
  | 'cash_accounts.manage'
  | 'collections.register'
  | 'collections.void'
  | 'liquidations.share'
  | 'expenses.recurring.manage'
  | 'reminders.generate'
  | 'reminders.send'

export interface IAdminLegalInfoBank {
  name?: string
  cbu?: string
  alias?: string
  account?: string
}

export interface IAdminLegalInfoInsurance {
  company?: string
  policy?: string
  coverage?: string
  from?: string
  to?: string
}

export interface IAdminLegalInfoAmenity {
  name?: string
  price?: string
  deposit?: string
}

export interface IAdminLegalInfo {
  bank?: IAdminLegalInfoBank
  accountantName?: string
  accountantPhone?: string
  accountantEmail?: string
  insurance?: IAdminLegalInfoInsurance[]
  amenities?: IAdminLegalInfoAmenity[]
  collectionSchedule?: string
  footerNotes?: string
}

export interface IAdminAdministration {
  id: string
  name: string
  legalName: string | null
  taxId: string | null
  contactEmail: string | null
  contactPhone: string | null
  isActive: boolean
  legalInfo: IAdminLegalInfo
  createdAt: string
}

export interface IAdminMembership {
  administration: IAdminAdministration
  operationalRole: IAdminOperationalRole | string
  isPrimary: boolean
  capabilities: IAdminCapability[]
}

export interface IAdminContext {
  isSuperAdmin: boolean
  memberships: IAdminMembership[]
  primary: IAdminMembership | null
}

export interface IAdminManagedProperty {
  id: string
  administrationId: string
  buildingId: string
  buildingName: string
  buildingAddress: string
  displayName: string | null
  propertyKind: IAdminPropertyKind
  taxId: string | null
  managedSince: string | null
  managementFeePct: number | null
  notes: string | null
  isActive: boolean
  totalUnits: number
  legalInfo: IAdminLegalInfo
  createdAt: string
}

export interface IAdminPortfolioStats {
  totalProperties: number
  totalUnits: number
  openExpenses: number
  pendingDocs: number
}

export interface IAdminPortfolio {
  administration: IAdminAdministration
  properties: IAdminManagedProperty[]
  stats: IAdminPortfolioStats
}

export interface IAdminPortfolioPropertyRow {
  property: IAdminManagedProperty
  totalBalance: number                    // suma saldos cuentas activas
  pendingExpenses: number                 // gastos sin imputar (approved/pending_review/needs_doc)
  accountsPayableTotal: number            // deuda a proveedores
  overdueAmount: number                   // deuda acumulada de vecinos (runs emitidas)
  currentMonthLiquidated: number          // total liquidado del mes en curso
  currentMonthCollected: number           // cobrado del mes en curso
  collectionRatePct: number | null
  hasOpenPeriod: boolean
  runStatusThisMonth: IAdminLiquidationStatus | null
  alerts: string[]
}

export interface IAdminPortfolioOverview {
  administration: IAdminAdministration
  rows: IAdminPortfolioPropertyRow[]
  totals: {
    totalBalance: number
    totalOverdue: number
    totalPayable: number
    totalLiquidatedMonth: number
    totalCollectedMonth: number
    pendingExpenses: number
  }
}

export interface IAdminUnit {
  id: string
  managedPropertyId: string
  code: string
  kind: IAdminUnitKind
  floor: string | null
  surfaceM2: number | null
  prorataCoefficient: number | null
  isActive: boolean
  activeHolderName: string | null
  activeHolderKind: IAdminHolderKind | null
}

export interface IAdminUnitHolder {
  id: string
  unitId: string
  profileId: string | null
  fullName: string
  taxId: string | null
  email: string | null
  phone: string | null
  holderKind: IAdminHolderKind
  startDate: string | null
  endDate: string | null
  isActive: boolean
}

export interface IAdminAccountingPeriod {
  id: string
  managedPropertyId: string
  periodYear: number
  periodMonth: number
  status: IAdminPeriodStatus
  closedAt: string | null
}

export interface IAdminExpenseSummary {
  id: string
  administrationId: string
  managedPropertyId: string
  managedPropertyName: string
  providerName: string | null
  category: string | null
  description: string
  amount: number
  currency: string
  issuedAt: string | null
  status: IAdminExpenseStatus
  expenseKind: IAdminExpenseKind
  hasDocuments: boolean
  pendingExtraction: boolean
  createdAt: string
}

export interface IAdminExpenseDocument {
  id: string
  expenseId: string
  storagePath: string
  fileName: string
  mimeType: string | null
  sizeBytes: number | null
  uploadedAt: string
  extraction: IAdminAIExtraction | null
}

export interface IAdminAIExtraction {
  id: string
  documentId: string
  status: IAdminAIExtractionStatus
  provider: string | null
  suggestedFields: Record<string, unknown> | null
  confidence: number | null
  validatedBy: string | null
  validatedAt: string | null
  validationNotes: string | null
}

export interface IAdminConsorcioDetail {
  property: IAdminManagedProperty
  units: IAdminUnit[]
  recentExpenses: IAdminExpenseSummary[]
  currentPeriod: IAdminAccountingPeriod | null
  buildingInformation: BuildingInformationItem[]
  totals: {
    units: number
    activeHolders: number
    monthExpenses: number
    monthAmount: number
  }
}

export interface IAdminProvider {
  id: string
  administrationId: string
  name: string
  taxId: string | null
  category: string | null
  email: string | null
  phone: string | null
  notes: string | null
  defaultCategory: string | null
  defaultDescription: string | null
  isRecurring: boolean
  recurringAmount: number | null
  recurringKind: IAdminExpenseKind
  isActive: boolean
  createdAt: string
}

export type IAdminReminderKind = 'pre_due' | 'overdue_first' | 'overdue_second' | 'overdue_heavy'
export type IAdminReminderStatus = 'pending' | 'sent' | 'dismissed'

export interface IAdminReminder {
  id: string
  administrationId: string
  managedPropertyId: string | null
  propertyName: string | null
  liquidationItemId: string
  unitCode: string
  holderName: string | null
  holderPhone: string | null
  holderEmail: string | null
  reminderKind: IAdminReminderKind
  status: IAdminReminderStatus
  messageBody: string | null
  amountDue: number | null
  dueLabel: string | null
  dueDate: string | null
  generatedAt: string
  sentAt: string | null
  dismissedAt: string | null
  shareUrl: string | null
}

export interface IAdminUnitWithHolders extends IAdminUnit {
  holders: IAdminUnitHolder[]
  memberships: UnitProfileMembership[]
}

export type IAdminCashAccountKind = 'bank' | 'cash' | 'reserve' | 'other'

export type IAdminMovementKind =
  | 'manual'
  | 'expense_payment'
  | 'collection'
  | 'transfer'
  | 'adjustment'
  | 'opening'

export interface IAdminCashAccount {
  id: string
  managedPropertyId: string
  name: string
  kind: IAdminCashAccountKind
  bankName: string | null
  accountNumber: string | null
  cbu: string | null
  alias: string | null
  openingBalance: number
  openingBalanceAt: string | null
  isActive: boolean
  notes: string | null
  createdAt: string
}

export interface IAdminCashAccountWithBalance extends IAdminCashAccount {
  currentBalance: number
  movementsCount: number
}

export interface IAdminCashMovement {
  id: string
  cashAccountId: string | null
  cashAccountName: string | null
  administrationId: string
  managedPropertyId: string | null
  movementDate: string
  description: string | null
  amount: number
  balance: number | null
  externalRef: string | null
  movementKind: IAdminMovementKind
  expenseId: string | null
  expenseDescription: string | null
  createdAt: string
}

export interface IAdminDashboardCashSnapshot {
  label: string
  amount: number
  kind: 'operating' | 'reserve' | 'bank' | 'cash'
  placeholder?: boolean
}

export interface IAdminAccountPayable {
  providerId: string | null
  providerName: string
  amount: number
  expensesCount: number
  oldestDate: string | null
}

export interface IAdminPeriodCollections {
  liquidatedOrdinary: number
  liquidatedExtraordinary: number
  liquidatedTotal: number
  collectedOrdinary: number
  collectedExtraordinary: number
  collectedTotal: number
  collectionRatePct: number | null  // null si no hay liquidado
  runId: string | null
  periodLabel: string | null
  placeholder?: boolean
}

export interface IAdminOverdueBucket {
  periodLabel: string        // ej. "Enero 2026"
  periodsOld: number          // cantidad de meses vencidos
  unitsCount: number
  totalAmount: number
}

export interface IAdminMonthlyGridRow {
  providerId: string
  providerName: string
  category: string | null
  isRecurring: boolean
  expenseKind: IAdminExpenseKind
  cells: Array<{
    year: number
    month: number
    amount: number | null
    expenseId: string | null
    hasDocument: boolean
    isEditable: boolean  // false si el periodo esta closed
    // Trazabilidad (solo si hay un único gasto detrás de la celda)
    createdByName: string | null
    createdAt: string | null
    updatedAt: string | null
    status: IAdminExpenseStatus | null
    description: string | null
    issuedAt: string | null
    documentId: string | null
    documentName: string | null
    documentPath: string | null
  }>
  lastAmount: number | null        // ultimo valor no-null (de referencia)
}

export interface IAdminMesaUnitLine {
  unitId: string
  unitCode: string
  unitKind: IAdminUnitKind
  holderName: string | null
  holderPhone: string | null
  prorataCoefficient: number
  ordinary: number
  extraordinary: number
  previousBalance: number
  subtotal: number
  collected: number
  balance: number
  dueAmounts: Array<{ label: string; date: string; amount: number }>
}

export interface IAdminUnitAccountMonth {
  year: number
  month: number
  label: string           // "ENE 25"
  periodStatus: IAdminPeriodStatus | null
  runId: string | null
  runStatus: IAdminLiquidationStatus | null
  liquidationItemId: string | null
  // Totales de la unidad en ese mes
  ordinary: number
  extraordinary: number
  previousBalance: number
  subtotal: number
  collected: number
  balance: number         // saldo pendiente
  isCurrent: boolean
}

export interface IAdminUnitPaymentReceipt {
  id: string
  receiptNumber: string | null
  amount: number
  paidAt: string
  method: string | null
  reference: string | null
  dueLabel: string | null
  surchargeAmount: number
  isVoid: boolean
  notes: string | null
  liquidationRunId: string | null
  periodLabel: string | null  // "ABR 26"
}

export interface IAdminUnitAccountStatement {
  propertyId: string
  administrationId: string
  unit: {
    id: string
    code: string
    kind: IAdminUnitKind
    prorataCoefficient: number
    holderName: string | null
    holderPhone: string | null
    holderEmail: string | null
  }
  months: IAdminUnitAccountMonth[]        // del más viejo al más nuevo
  payments: IAdminUnitPaymentReceipt[]    // descendente por paidAt
  totals: {
    billed: number
    collected: number
    pending: number
    collectionRatePct: number | null
  }
}

export interface IAdminMesaState {
  runId: string | null
  runStatus: IAdminLiquidationStatus | null
  hasRun: boolean
  ordinaryTotal: number
  extraordinaryTotal: number
  previousBalanceTotal: number
  totalToDistribute: number
  totalCollected: number
  totalPending: number
  collectionRatePct: number | null
  units: IAdminMesaUnitLine[]
  dueDates: IAdminDueDate[]
  coverageOk: boolean   // suma alicuotas = 100%
  coverageDeltaPct: number
  alicuotaSum: number
}

export interface IAdminMonthlyGrid {
  propertyId: string
  propertyName: string
  administrationId: string
  months: Array<{
    year: number
    month: number
    label: string       // "NOV 25"
    isCurrent: boolean
    total: number
    periodStatus: IAdminPeriodStatus | null
    runId: string | null
    runStatus: IAdminLiquidationStatus | null
  }>
  rows: IAdminMonthlyGridRow[]
  freeRow: IAdminMonthlyGridRow | null   // celda sin proveedor asociado (para gastos ad-hoc)
  totalByMonth: Record<string, number>
  activeUnitsCount: number
  totalAlicuota: number            // suma de alicuotas activas
  readyToEmit: boolean              // hay al menos 1 gasto en el mes actual
}

export type IAdminClosingStepId =
  | 'period_open'
  | 'expenses_loaded'
  | 'expenses_reviewed'
  | 'period_locked'
  | 'liquidation_generated'
  | 'liquidation_issued'
  | 'announcement_sent'
  | 'reminders_generated'
  | 'period_closed'

export interface IAdminClosingStep {
  id: IAdminClosingStepId
  label: string
  helper: string
  done: boolean
  skipped?: boolean
  ctaHref?: string
  ctaLabel?: string
  blockedReason?: string
}

export interface IAdminClosingChecklist {
  periodYear: number
  periodMonth: number
  periodLabel: string
  periodStatus: IAdminPeriodStatus | null
  steps: IAdminClosingStep[]
  completedCount: number
  totalCount: number
  progressPct: number
  nextStep: IAdminClosingStep | null
}

export interface IAdminConsorcioDashboard {
  property: IAdminManagedProperty
  balances: IAdminDashboardCashSnapshot[]
  totalBalance: number
  accountsPayable: IAdminAccountPayable[]
  totalPayable: number
  periodCollections: IAdminPeriodCollections
  overdueBuckets: IAdminOverdueBucket[]
  totalOverdueAmount: number
  totalOverdueUnits: number
  pendingExpenses: number       // gastos pending_review + needs_doc
  pendingDocuments: number      // extracciones pending/suggested
  activeUnitsCount: number
  recurringProvidersCount: number
}

export interface IAdminLiquidationRunSummary {
  id: string
  managedPropertyId: string
  managedPropertyName: string
  periodYear: number
  periodMonth: number
  status: IAdminLiquidationStatus
  totalExpenses: number
  totalUnits: number
  generatedAt: string
  closedAt: string | null
}

export interface IAdminDueDate {
  label: string           // ej. "1er venc"
  date: string            // ISO date (YYYY-MM-DD)
  surchargePct: number    // recargo sobre el subtotal (0 para el primer venc)
}

export interface IAdminLiquidationItemDueAmount {
  label: string
  date: string
  surchargePct: number
  amount: number          // total a pagar en ese vencimiento (ordinaria + extra + saldo previo + recargo)
}

export interface IAdminPayment {
  id: string
  administrationId: string
  managedPropertyId: string
  liquidationRunId: string | null
  liquidationItemId: string | null
  unitId: string | null
  unitCode: string | null
  cashAccountId: string | null
  cashAccountName: string | null
  bankMovementId: string | null
  amount: number
  surchargeAmount: number
  paidAt: string
  method: string | null
  reference: string | null
  receiptNumber: string | null
  dueLabel: string | null
  notes: string | null
  isVoid: boolean
  voidedAt: string | null
  voidReason: string | null
  createdAt: string
}

export interface IAdminLiquidationItem {
  id: string
  unitId: string
  unitCode: string
  unitKind: IAdminUnitKind
  activeHolderName: string | null
  activeHolderKind: IAdminHolderKind | null
  prorataCoefficient: number
  ordinaryAmount: number
  extraordinaryAmount: number
  previousBalance: number
  amount: number                       // compat: ordinary_amount (legacy)
  subtotal: number                     // ordinary + extraordinary + previousBalance
  dueAmounts: IAdminLiquidationItemDueAmount[]
  collectedAmount: number              // total cobrado (sin void)
  balanceRemaining: number             // subtotal - collectedAmount (clamp >= 0)
  payments: IAdminPayment[]
}

export interface IAdminExpenseLineInRun {
  id: string
  issuedAt: string | null
  providerName: string | null
  description: string
  category: string | null
  amount: number
  kind: IAdminExpenseKind
}

export interface IAdminCashStatement {
  previousBalance: number
  ordinaryIncome: number
  extraordinaryIncome: number
  totalIncome: number
  ordinaryExpenses: number
  extraordinaryExpenses: number
  totalExpenses: number
  endingBalance: number
}

export interface IAdminLiquidationRunDetail {
  id: string
  administrationId: string
  administrationName: string
  administrationLegalInfo: IAdminLegalInfo
  propertyLegalInfo: IAdminLegalInfo
  managedPropertyId: string
  managedPropertyName: string
  managedPropertyAddress: string
  accountingPeriodId: string
  periodYear: number
  periodMonth: number
  status: IAdminLiquidationStatus
  totalExpenses: number
  ordinaryTotal: number
  extraordinaryTotal: number
  previousBalance: number
  totalUnits: number
  generatedAt: string
  generatedByName: string | null
  issuedAt: string | null
  issuedByName: string | null
  closedAt: string | null
  closedByName: string | null
  dueDates: IAdminDueDate[]
  items: IAdminLiquidationItem[]
  expenseLines: IAdminExpenseLineInRun[]
  cashStatement: IAdminCashStatement
  totalAssigned: number
  coverageDelta: number
  collectedTotal: number
  balanceTotal: number
  cashAccounts: IAdminCashAccountWithBalance[]
}
