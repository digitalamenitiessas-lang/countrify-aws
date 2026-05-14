import { getSupabaseServerClient } from '@/lib/supabase/server'

// ─── shared helpers ──────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10)
}

// ─── Vecino context ──────────────────────────────────────────────────────────

export interface VecinoContext {
  role: 'vecino'
  profile: {
    fullName: string
    floor: string | null
    unit: string | null
    buildingName: string | null
    buildingAddress: string | null
  }
  promotions: { title: string; businessName: string; discount: string; expirationDate: string; isActive: boolean }[]
  savedCoupons: { title: string; businessName: string; discount: string; isUsed: boolean }[]
  marketplaceItems: { title: string; price: number; condition: string; sellerName: string }[]
  myComplaints: { title: string; status: string; createdAt: string }[]
}

export async function buildVecinoContext(userId: string): Promise<VecinoContext | null> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, floor, unit, building_id')
    .eq('id', userId)
    .single()

  if (!profile) return null

  const buildingId = profile.building_id

  const [
    { data: buildingData },
    { data: promotionsData },
    { data: savedRows },
    { data: usedRows },
    { data: marketplaceData },
    { data: complaintRows },
  ] = await Promise.all([
    buildingId
      ? supabase.from('buildings').select('name, address').eq('id', buildingId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('promotions')
      .select('title, discount, expiration_date, is_active, businesses(name), building_id')
      .eq('is_active', true)
      .gte('expiration_date', today())
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('saved_promotions').select('promotion_id').eq('profile_id', userId),
    supabase.from('promotion_redemptions').select('promotion_id').eq('profile_id', userId),
    buildingId
      ? supabase
          .from('marketplace_items')
          .select('title, price, condition, profiles(full_name)')
          .eq('building_id', buildingId)
          .eq('is_active', true)
          .limit(15)
      : Promise.resolve({ data: [] }),
    buildingId
      ? supabase
          .from('complaint_cases')
          .select('title, status, created_at')
          .eq('author_profile_id', userId)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
  ])

  const savedIds = new Set((savedRows ?? []).map((r: any) => r.promotion_id))
  const usedIds = new Set((usedRows ?? []).map((r: any) => r.promotion_id))

  // Only show promotions for their building or global ones
  const filteredPromos = (promotionsData ?? []).filter(
    (p: any) => !p.building_id || p.building_id === buildingId,
  )

  // Build saved coupons with usage status
  const allPromoIds = savedIds.size > 0 ? Array.from(savedIds) : []
  let savedCouponsData: any[] = []
  if (allPromoIds.length > 0) {
    const { data } = await supabase
      .from('promotions')
      .select('id, title, discount, businesses(name)')
      .in('id', allPromoIds)
    savedCouponsData = data ?? []
  }

  return {
    role: 'vecino',
    profile: {
      fullName: profile.full_name ?? 'Usuario',
      floor: profile.floor ?? null,
      unit: profile.unit ?? null,
      buildingName: (buildingData as any)?.name ?? null,
      buildingAddress: (buildingData as any)?.address ?? null,
    },
    promotions: filteredPromos.map((p: any) => ({
      title: p.title,
      businessName: (Array.isArray(p.businesses) ? p.businesses[0] : p.businesses)?.name ?? 'Negocio',
      discount: p.discount,
      expirationDate: p.expiration_date,
      isActive: p.is_active,
    })),
    savedCoupons: savedCouponsData.map((p: any) => ({
      title: p.title,
      businessName: (Array.isArray(p.businesses) ? p.businesses[0] : p.businesses)?.name ?? 'Negocio',
      discount: p.discount,
      isUsed: usedIds.has(p.id),
    })),
    marketplaceItems: (marketplaceData ?? []).map((item: any) => ({
      title: item.title,
      price: Number(item.price ?? 0),
      condition: item.condition,
      sellerName: (Array.isArray(item.profiles) ? item.profiles[0] : item.profiles)?.full_name ?? 'Vecino',
    })),
    myComplaints: (complaintRows ?? []).map((c: any) => ({
      title: c.title,
      status: c.status,
      createdAt: c.created_at,
    })),
  }
}

// ─── Consorcio Admin context ──────────────────────────────────────────────────

export interface ConsorcioContext {
  role: 'consorcio_admin'
  adminName: string
  buildings: {
    name: string
    address: string
    totalUnits: number
    registeredNeighbors: number
    occupancyRate: number
    neighbors: { fullName: string; floor: string | null; unit: string | null }[]
    complaints: { title: string; status: string; createdAt: string }[]
  }[]
}

export async function buildConsorcioContext(userId: string): Promise<ConsorcioContext | null> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()

  const { data: assignments } = await supabase
    .from('building_admin_assignments')
    .select('building_id')
    .eq('profile_id', userId)

  const buildingIds = (assignments ?? []).map((a: any) => a.building_id)
  if (buildingIds.length === 0) {
    return {
      role: 'consorcio_admin',
      adminName: profile?.full_name ?? 'Administrador',
      buildings: [],
    }
  }

  const [{ data: buildingsData }, { data: neighborsData }, { data: complaintsData }] = await Promise.all([
    supabase.from('buildings').select('id, name, address, total_units').in('id', buildingIds),
    supabase
      .from('profiles')
      .select('full_name, floor, unit, building_id')
      .eq('role', 'vecino')
      .in('building_id', buildingIds)
      .order('full_name'),
    supabase
      .from('complaint_cases')
      .select('title, status, building_id, created_at')
      .in('building_id', buildingIds)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const neighborsByBuilding = new Map<string, any[]>()
  for (const n of neighborsData ?? []) {
    const arr = neighborsByBuilding.get(n.building_id) ?? []
    arr.push(n)
    neighborsByBuilding.set(n.building_id, arr)
  }

  const complaintsByBuilding = new Map<string, any[]>()
  for (const c of complaintsData ?? []) {
    const arr = complaintsByBuilding.get(c.building_id) ?? []
    arr.push(c)
    complaintsByBuilding.set(c.building_id, arr)
  }

  return {
    role: 'consorcio_admin',
    adminName: profile?.full_name ?? 'Administrador',
    buildings: (buildingsData ?? []).map((b: any) => {
      const neighbors = neighborsByBuilding.get(b.id) ?? []
      const totalUnits = b.total_units ?? 0
      return {
        name: b.name,
        address: b.address,
        totalUnits,
        registeredNeighbors: neighbors.length,
        occupancyRate: Math.round((neighbors.length / Math.max(totalUnits, 1)) * 100),
        neighbors: neighbors.map((n: any) => ({
          fullName: n.full_name ?? 'Vecino',
          floor: n.floor ?? null,
          unit: n.unit ?? null,
        })),
        complaints: (complaintsByBuilding.get(b.id) ?? []).map((c: any) => ({
          title: c.title,
          status: c.status,
          createdAt: c.created_at,
        })),
      }
    }),
  }
}

// ─── Negocio Admin context ────────────────────────────────────────────────────

export interface NegocioContext {
  role: 'negocio_admin'
  adminName: string
  business: {
    name: string
    category: string
    description: string
  } | null
  promotions: {
    title: string
    discount: string
    expirationDate: string
    isActive: boolean
    totalRedemptions: number
  }[]
  totalRedemptions: number
  totalVecinos: number
}

export async function buildNegocioContext(userId: string): Promise<NegocioContext | null> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, business_id')
    .eq('id', userId)
    .single()

  const businessId = profile?.business_id

  const [{ data: businessData }, { data: promotionsData }, { count: vecinoCount }] = await Promise.all([
    businessId
      ? supabase.from('businesses').select('name, category, description').eq('id', businessId).maybeSingle()
      : Promise.resolve({ data: null }),
    businessId
      ? supabase
          .from('promotions')
          .select('title, discount, expiration_date, is_active, promotion_redemptions(id)')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'vecino'),
  ])

  const promotions = (promotionsData ?? []).map((p: any) => {
    const redemptions = Array.isArray(p.promotion_redemptions) ? p.promotion_redemptions : []
    return {
      title: p.title,
      discount: p.discount,
      expirationDate: p.expiration_date,
      isActive: Boolean(p.is_active),
      totalRedemptions: redemptions.length,
    }
  })

  return {
    role: 'negocio_admin',
    adminName: profile?.full_name ?? 'Administrador',
    business: businessData
      ? {
          name: (businessData as any).name,
          category: (businessData as any).category,
          description: (businessData as any).description ?? '',
        }
      : null,
    promotions,
    totalRedemptions: promotions.reduce((sum, p) => sum + p.totalRedemptions, 0),
    totalVecinos: vecinoCount ?? 0,
  }
}

// ─── Propietario context ──────────────────────────────────────────────────────

export interface PropietarioContext {
  role: 'propietario'
  fullName: string
  units: {
    code: string
    floor: string | null
    buildingName: string
    buildingAddress: string
    latestLiquidation: {
      period: string
      ordinaryAmount: number
      extraordinaryAmount: number
      previousBalance: number
      subtotal: number
    } | null
    recentPayments: { amount: number; paidAt: string }[]
  }[]
  buildingNotices: { title: string; content: string }[]
}

export async function buildPropietarioContext(userId: string): Promise<PropietarioContext | null> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()
  if (!profileRow) return null

  const { data: membershipRows } = await supabase
    .from('unit_profile_memberships')
    .select(`
      iadmin_units (
        id,
        code,
        floor,
        iadmin_managed_properties (
          display_name,
          buildings ( id, name, address )
        )
      )
    `)
    .eq('profile_id', userId)
    .eq('relationship_type', 'propietario')
    .eq('active', true)

  const unitRows = (membershipRows ?? [])
    .map((m: any) => {
      const unit = Array.isArray(m.iadmin_units) ? m.iadmin_units[0] : m.iadmin_units
      if (!unit) return null
      const prop = Array.isArray(unit.iadmin_managed_properties)
        ? unit.iadmin_managed_properties[0]
        : unit.iadmin_managed_properties
      const building = Array.isArray(prop?.buildings) ? prop.buildings[0] : prop?.buildings
      return { unitId: unit.id as string, code: unit.code as string, floor: unit.floor as string | null, buildingId: building?.id as string, buildingName: building?.name ?? prop?.display_name ?? 'Edificio', buildingAddress: building?.address ?? '' }
    })
    .filter(Boolean) as { unitId: string; code: string; floor: string | null; buildingId: string; buildingName: string; buildingAddress: string }[]

  const unitIds = unitRows.map((u) => u.unitId)
  const buildingIds = Array.from(new Set(unitRows.map((u) => u.buildingId).filter(Boolean)))

  const [{ data: liquidationRows }, { data: paymentRows }, { data: noticeRows }] = await Promise.all([
    unitIds.length
      ? supabase
          .from('iadmin_liquidation_items')
          .select('unit_id, amount, ordinary_amount, extraordinary_amount, previous_balance, iadmin_liquidation_runs!inner(period_year, period_month, status, generated_at)')
          .in('unit_id', unitIds)
          .order('generated_at', { referencedTable: 'iadmin_liquidation_runs', ascending: false })
      : Promise.resolve({ data: [] }),
    unitIds.length
      ? supabase
          .from('iadmin_payments')
          .select('unit_id, amount, paid_at')
          .in('unit_id', unitIds)
          .eq('is_void', false)
          .order('paid_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    buildingIds.length
      ? supabase
          .from('building_information')
          .select('title, content')
          .in('building_id', buildingIds)
          .eq('is_active', true)
          .in('visible_to', ['residentes', 'propietarios'])
          .order('sort_order', { ascending: true })
          .limit(10)
      : Promise.resolve({ data: [] }),
  ])

  const latestByUnit = new Map<string, any>()
  for (const item of liquidationRows ?? []) {
    if (!latestByUnit.has(item.unit_id)) latestByUnit.set(item.unit_id, item)
  }

  const paymentsByUnit = new Map<string, { amount: number; paidAt: string }[]>()
  for (const p of paymentRows ?? []) {
    const arr = paymentsByUnit.get(p.unit_id) ?? []
    arr.push({ amount: Number(p.amount ?? 0), paidAt: p.paid_at })
    paymentsByUnit.set(p.unit_id, arr)
  }

  return {
    role: 'propietario',
    fullName: profileRow.full_name ?? 'Propietario',
    units: unitRows.map((u) => {
      const liq = latestByUnit.get(u.unitId)
      const run = liq ? (Array.isArray(liq.iadmin_liquidation_runs) ? liq.iadmin_liquidation_runs[0] : liq.iadmin_liquidation_runs) : null
      const ordinary = Number(liq?.ordinary_amount ?? liq?.amount ?? 0)
      const extraordinary = Number(liq?.extraordinary_amount ?? 0)
      const previous = Number(liq?.previous_balance ?? 0)
      return {
        code: u.code,
        floor: u.floor,
        buildingName: u.buildingName,
        buildingAddress: u.buildingAddress,
        latestLiquidation: run
          ? { period: `${run.period_year}-${String(run.period_month).padStart(2, '0')}`, ordinaryAmount: ordinary, extraordinaryAmount: extraordinary, previousBalance: previous, subtotal: ordinary + extraordinary + previous }
          : null,
        recentPayments: (paymentsByUnit.get(u.unitId) ?? []).slice(0, 5),
      }
    }),
    buildingNotices: (noticeRows ?? []).map((n: any) => ({ title: n.title, content: n.content ?? '' })),
  }
}

// ─── Super Admin context ──────────────────────────────────────────────────────

export interface SuperAdminContext {
  role: 'super_admin'
  totalUsers: number
  totalVecinos: number
  totalBuildings: number
  totalBusinesses: number
  totalPromotions: number
  totalRedemptions: number
  buildings: { name: string; address: string; totalUnits: number; registeredNeighbors: number }[]
  businesses: { name: string; category: string; promotionCount: number; redemptionCount: number }[]
  recentPromotions: { title: string; businessName: string; discount: string; expirationDate: string; isActive: boolean }[]
}

export async function buildSuperAdminContext(): Promise<SuperAdminContext | null> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  const [
    { data: usersData },
    { data: buildingsData },
    { data: businessesData },
    { data: promotionsData },
    { count: redemptionCount },
  ] = await Promise.all([
    supabase.from('profiles').select('id, role, building_id').order('full_name'),
    supabase.from('buildings').select('id, name, address, total_units').order('name'),
    supabase.from('businesses').select('id, name, category').order('name'),
    supabase
      .from('promotions')
      .select('id, title, discount, expiration_date, is_active, businesses(name), promotion_redemptions(id)')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('promotion_redemptions').select('*', { count: 'exact', head: true }),
  ])

  const neighborsByBuilding = new Map<string, number>()
  for (const u of usersData ?? []) {
    if (u.role === 'vecino' && u.building_id) {
      neighborsByBuilding.set(u.building_id, (neighborsByBuilding.get(u.building_id) ?? 0) + 1)
    }
  }

  // Count promotions & redemptions per business
  const businessPromoMap = new Map<string, { promos: number; redemptions: number }>()
  for (const p of promotionsData ?? []) {
    const redemptions = Array.isArray((p as any).promotion_redemptions) ? (p as any).promotion_redemptions : []
    const current = businessPromoMap.get((p as any).business_id) ?? { promos: 0, redemptions: 0 }
    current.promos += 1
    current.redemptions += redemptions.length
    businessPromoMap.set((p as any).business_id, current)
  }

  return {
    role: 'super_admin',
    totalUsers: (usersData ?? []).length,
    totalVecinos: (usersData ?? []).filter((u: any) => u.role === 'vecino').length,
    totalBuildings: (buildingsData ?? []).length,
    totalBusinesses: (businessesData ?? []).length,
    totalPromotions: (promotionsData ?? []).length,
    totalRedemptions: redemptionCount ?? 0,
    buildings: (buildingsData ?? []).map((b: any) => ({
      name: b.name,
      address: b.address,
      totalUnits: b.total_units ?? 0,
      registeredNeighbors: neighborsByBuilding.get(b.id) ?? 0,
    })),
    businesses: (businessesData ?? []).map((b: any) => {
      const stats = businessPromoMap.get(b.id) ?? { promos: 0, redemptions: 0 }
      return { name: b.name, category: b.category, promotionCount: stats.promos, redemptionCount: stats.redemptions }
    }),
    recentPromotions: (promotionsData ?? []).slice(0, 15).map((p: any) => ({
      title: p.title,
      businessName: (Array.isArray(p.businesses) ? p.businesses[0] : p.businesses)?.name ?? 'Negocio',
      discount: p.discount,
      expirationDate: p.expiration_date,
      isActive: Boolean(p.is_active),
    })),
  }
}
