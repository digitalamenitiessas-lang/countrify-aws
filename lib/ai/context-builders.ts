import { pgQuery } from '@/lib/db/postgres'

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
  const profileResult = await pgQuery<{
    full_name: string | null
    floor: string | null
    unit: string | null
    building_id: string | null
  }>(
    `select full_name, floor, unit, building_id from countrify.profiles where id = $1 limit 1`,
    [userId],
  )
  const profile = profileResult.rows[0]
  if (!profile) return null

  const buildingId = profile.building_id

  const [building, promotions, saved, used, marketplace, complaints] = await Promise.all([
    buildingId
      ? pgQuery<{ name: string; address: string | null }>(
          `select name, address from countrify.buildings where id = $1 limit 1`,
          [buildingId],
        ).then((r) => r.rows[0] ?? null)
      : Promise.resolve(null),
    pgQuery<{
      title: string
      discount: string
      expiration_date: string | null
      is_active: boolean
      business_name: string | null
      building_id: string | null
    }>(
      `
        select p.title, p.discount, p.expiration_date::text as expiration_date, p.is_active,
               b.name as business_name, p.building_id
        from public.promotions p
        left join public.businesses b on b.id = p.business_id
        where p.is_active = true and p.expiration_date >= $1::date
        order by p.created_at desc
        limit 20
      `,
      [today()],
    ).then((r) => r.rows),
    pgQuery<{ promotion_id: string }>(
      `select promotion_id from countrify.saved_promotions where profile_id = $1`,
      [userId],
    ).then((r) => r.rows.map((row: { promotion_id: string }) => row.promotion_id)),
    pgQuery<{ promotion_id: string }>(
      `select promotion_id from countrify.promotion_redemptions where profile_id = $1`,
      [userId],
    ).then((r) => r.rows.map((row: { promotion_id: string }) => row.promotion_id)),
    buildingId
      ? pgQuery<{ title: string; price: string; condition: string; seller_name: string | null }>(
          `
            select m.title, m.price::text as price, m.condition, p.full_name as seller_name
            from countrify.marketplace_items m
            left join countrify.profiles p on p.id = m.seller_profile_id
            where m.building_id = $1 and m.is_active = true
            limit 15
          `,
          [buildingId],
        ).then((r) => r.rows)
      : Promise.resolve([]),
    buildingId
      ? pgQuery<{ title: string; status: string; created_at: string }>(
          `
            select title, status::text as status, created_at::text as created_at
            from countrify.complaint_cases
            where author_profile_id = $1
            order by created_at desc
            limit 10
          `,
          [userId],
        ).then((r) => r.rows)
      : Promise.resolve([]),
  ])

  const savedIds = new Set(saved)
  const usedIds = new Set(used)

  const filteredPromos = promotions.filter((p: any) => !p.building_id || p.building_id === buildingId)

  let savedCouponsData: Array<{ id: string; title: string; discount: string; business_name: string | null }> = []
  if (savedIds.size > 0) {
    const r = await pgQuery<{ id: string; title: string; discount: string; business_name: string | null }>(
      `
        select p.id, p.title, p.discount, b.name as business_name
        from public.promotions p
        left join public.businesses b on b.id = p.business_id
        where p.id = any($1::uuid[])
      `,
      [Array.from(savedIds)],
    )
    savedCouponsData = r.rows
  }

  return {
    role: 'vecino',
    profile: {
      fullName: profile.full_name ?? 'Usuario',
      floor: profile.floor,
      unit: profile.unit,
      buildingName: building?.name ?? null,
      buildingAddress: building?.address ?? null,
    },
    promotions: filteredPromos.map((p: any) => ({
      title: p.title,
      businessName: p.business_name ?? 'Negocio',
      discount: p.discount,
      expirationDate: p.expiration_date ?? '',
      isActive: p.is_active,
    })),
    savedCoupons: savedCouponsData.map((p: any) => ({
      title: p.title,
      businessName: p.business_name ?? 'Negocio',
      discount: p.discount,
      isUsed: usedIds.has(p.id),
    })),
    marketplaceItems: marketplace.map((item: any) => ({
      title: item.title,
      price: Number(item.price ?? 0),
      condition: item.condition,
      sellerName: item.seller_name ?? 'Vecino',
    })),
    myComplaints: complaints.map((c: any) => ({
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
  const profileResult = await pgQuery<{ full_name: string | null }>(
    `select full_name from countrify.profiles where id = $1 limit 1`,
    [userId],
  )
  const profile = profileResult.rows[0]

  const assignmentsResult = await pgQuery<{ building_id: string }>(
    `select building_id from countrify.building_admin_assignments where profile_id = $1`,
    [userId],
  )
  const buildingIds = assignmentsResult.rows.map((r: { building_id: string }) => r.building_id)

  if (buildingIds.length === 0) {
    return {
      role: 'consorcio_admin',
      adminName: profile?.full_name ?? 'Administrador',
      buildings: [],
    }
  }

  const [buildings, neighbors, complaints] = await Promise.all([
    pgQuery<{ id: string; name: string; address: string | null; total_units: number | null }>(
      `select id, name, address, total_units from countrify.buildings where id = any($1::uuid[])`,
      [buildingIds],
    ).then((r) => r.rows),
    pgQuery<{ full_name: string | null; floor: string | null; unit: string | null; building_id: string | null }>(
      `select full_name, floor, unit, building_id from countrify.profiles where role = 'vecino' and building_id = any($1::uuid[]) order by full_name`,
      [buildingIds],
    ).then((r) => r.rows),
    pgQuery<{ title: string; status: string; building_id: string; created_at: string }>(
      `
        select title, status::text as status, building_id, created_at::text as created_at
        from countrify.complaint_cases
        where building_id = any($1::uuid[])
        order by created_at desc
        limit 30
      `,
      [buildingIds],
    ).then((r) => r.rows),
  ])

  const neighborsByBuilding = new Map<string, typeof neighbors>()
  for (const n of neighbors) {
    if (!n.building_id) continue
    const arr = neighborsByBuilding.get(n.building_id) ?? []
    arr.push(n)
    neighborsByBuilding.set(n.building_id, arr)
  }

  const complaintsByBuilding = new Map<string, typeof complaints>()
  for (const c of complaints) {
    const arr = complaintsByBuilding.get(c.building_id) ?? []
    arr.push(c)
    complaintsByBuilding.set(c.building_id, arr)
  }

  return {
    role: 'consorcio_admin',
    adminName: profile?.full_name ?? 'Administrador',
    buildings: buildings.map((b: any) => {
      const list = neighborsByBuilding.get(b.id) ?? []
      const totalUnits = b.total_units ?? 0
      return {
        name: b.name,
        address: b.address ?? '',
        totalUnits,
        registeredNeighbors: list.length,
        occupancyRate: Math.round((list.length / Math.max(totalUnits, 1)) * 100),
        neighbors: list.map((n: any) => ({
          fullName: n.full_name ?? 'Vecino',
          floor: n.floor,
          unit: n.unit,
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
  const profileResult = await pgQuery<{ full_name: string | null; business_id: string | null }>(
    `select full_name, business_id from countrify.profiles where id = $1 limit 1`,
    [userId],
  )
  const profile = profileResult.rows[0]
  const businessId = profile?.business_id ?? null

  const [business, promotions, vecinoCountResult] = await Promise.all([
    businessId
      ? pgQuery<{ name: string; category: string; description: string | null }>(
          `select name, category, description from public.businesses where id = $1 limit 1`,
          [businessId],
        ).then((r) => r.rows[0] ?? null)
      : Promise.resolve(null),
    businessId
      ? pgQuery<{
          title: string
          discount: string
          expiration_date: string | null
          is_active: boolean
          redemption_count: number
        }>(
          `
            select p.title, p.discount, p.expiration_date::text as expiration_date, p.is_active,
                   coalesce((select count(*)::int from countrify.promotion_redemptions r where r.promotion_id = p.id), 0) as redemption_count
            from public.promotions p
            where p.business_id = $1
            order by p.created_at desc
          `,
          [businessId],
        ).then((r) => r.rows)
      : Promise.resolve([]),
    pgQuery<{ c: number }>(
      `select count(*)::int as c from countrify.profiles where role = 'vecino'`,
    ).then((r) => r.rows[0]?.c ?? 0),
  ])

  const mapped = promotions.map((p: any) => ({
    title: p.title,
    discount: p.discount,
    expirationDate: p.expiration_date ?? '',
    isActive: Boolean(p.is_active),
    totalRedemptions: p.redemption_count,
  }))

  return {
    role: 'negocio_admin',
    adminName: profile?.full_name ?? 'Administrador',
    business: business
      ? {
          name: business.name,
          category: business.category,
          description: business.description ?? '',
        }
      : null,
    promotions: mapped,
    totalRedemptions: mapped.reduce((sum: number, p: any) => sum + p.totalRedemptions, 0),
    totalVecinos: vecinoCountResult,
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
  const profileResult = await pgQuery<{ full_name: string | null }>(
    `select full_name from countrify.profiles where id = $1 limit 1`,
    [userId],
  )
  const profileRow = profileResult.rows[0]
  if (!profileRow) return null

  const unitRowsResult = await pgQuery<{
    unit_id: string
    code: string
    floor: string | null
    building_id: string | null
    building_name: string | null
    building_address: string | null
    display_name: string | null
  }>(
    `
      select
        u.id as unit_id, u.code, u.floor,
        b.id as building_id, b.name as building_name, b.address as building_address,
        mp.display_name
      from countrify.unit_profile_memberships m
      inner join countrify.iadmin_units u on u.id = m.unit_id
      inner join countrify.iadmin_managed_properties mp on mp.id = u.managed_property_id
      inner join countrify.buildings b on b.id = mp.building_id
      where m.profile_id = $1
        and m.relationship_type = 'propietario'
        and m.active = true
    `,
    [userId],
  )
  const unitRows = unitRowsResult.rows.map((row: any) => ({
    unitId: row.unit_id,
    code: row.code,
    floor: row.floor,
    buildingId: row.building_id ?? '',
    buildingName: row.building_name ?? row.display_name ?? 'Edificio',
    buildingAddress: row.building_address ?? '',
  }))

  const unitIds = unitRows.map((u: any) => u.unitId)
  const buildingIds = Array.from(new Set(unitRows.map((u: any) => u.buildingId).filter(Boolean)))

  const [liquidations, payments, notices] = await Promise.all([
    unitIds.length
      ? pgQuery<{
          unit_id: string
          amount: string | null
          ordinary_amount: string | null
          extraordinary_amount: string | null
          previous_balance: string | null
          period_year: number | null
          period_month: number | null
        }>(
          `
            select
              i.unit_id, i.amount::text as amount,
              i.ordinary_amount::text as ordinary_amount,
              i.extraordinary_amount::text as extraordinary_amount,
              i.previous_balance::text as previous_balance,
              ap.period_year, ap.period_month
            from countrify.iadmin_liquidation_items i
            inner join countrify.iadmin_liquidation_runs r on r.id = i.liquidation_run_id
            left join countrify.iadmin_accounting_periods ap on ap.id = r.accounting_period_id
            where i.unit_id = any($1::uuid[])
            order by r.generated_at desc
          `,
          [unitIds],
        ).then((r) => r.rows)
      : Promise.resolve([]),
    unitIds.length
      ? pgQuery<{ unit_id: string | null; amount: string; paid_at: string }>(
          `
            select unit_id, amount::text as amount, paid_at::text as paid_at
            from countrify.iadmin_payments
            where unit_id = any($1::uuid[]) and is_void = false
            order by paid_at desc
            limit 20
          `,
          [unitIds],
        ).then((r) => r.rows)
      : Promise.resolve([]),
    buildingIds.length
      ? pgQuery<{ title: string; content: string }>(
          `
            select title, content
            from countrify.building_information
            where building_id = any($1::uuid[])
              and is_active = true
              and visible_to::text in ('residentes', 'propietarios')
            order by sort_order asc
            limit 10
          `,
          [buildingIds],
        ).then((r) => r.rows)
      : Promise.resolve([]),
  ])

  const latestByUnit = new Map<string, (typeof liquidations)[number]>()
  for (const item of liquidations) {
    if (!latestByUnit.has(item.unit_id)) latestByUnit.set(item.unit_id, item)
  }

  const paymentsByUnit = new Map<string, { amount: number; paidAt: string }[]>()
  for (const p of payments) {
    if (!p.unit_id) continue
    const arr = paymentsByUnit.get(p.unit_id) ?? []
    arr.push({ amount: Number(p.amount ?? 0), paidAt: p.paid_at })
    paymentsByUnit.set(p.unit_id, arr)
  }

  return {
    role: 'propietario',
    fullName: profileRow.full_name ?? 'Propietario',
    units: unitRows.map((u: any) => {
      const liq = latestByUnit.get(u.unitId)
      const ordinary = Number(liq?.ordinary_amount ?? liq?.amount ?? 0)
      const extraordinary = Number(liq?.extraordinary_amount ?? 0)
      const previous = Number(liq?.previous_balance ?? 0)
      return {
        code: u.code,
        floor: u.floor,
        buildingName: u.buildingName,
        buildingAddress: u.buildingAddress,
        latestLiquidation: liq && liq.period_year && liq.period_month
          ? {
              period: `${liq.period_year}-${String(liq.period_month).padStart(2, '0')}`,
              ordinaryAmount: ordinary,
              extraordinaryAmount: extraordinary,
              previousBalance: previous,
              subtotal: ordinary + extraordinary + previous,
            }
          : null,
        recentPayments: (paymentsByUnit.get(u.unitId) ?? []).slice(0, 5),
      }
    }),
    buildingNotices: notices.map((n: any) => ({ title: n.title, content: n.content ?? '' })),
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
  const [users, buildings, businesses, promotions, redemptionCountResult] = await Promise.all([
    pgQuery<{ role: string; building_id: string | null }>(
      `select role::text as role, building_id from countrify.profiles`,
    ).then((r) => r.rows),
    pgQuery<{ id: string; name: string; address: string | null; total_units: number | null }>(
      `select id, name, address, total_units from countrify.buildings order by name`,
    ).then((r) => r.rows),
    pgQuery<{ id: string; name: string; category: string }>(
      `select id, name, category from public.businesses order by name`,
    ).then((r) => r.rows),
    pgQuery<{
      id: string
      title: string
      discount: string
      expiration_date: string | null
      is_active: boolean
      business_id: string
      business_name: string | null
      redemption_count: number
    }>(
      `
        select p.id, p.title, p.discount, p.expiration_date::text as expiration_date, p.is_active,
               p.business_id, b.name as business_name,
               coalesce((select count(*)::int from countrify.promotion_redemptions r where r.promotion_id = p.id), 0) as redemption_count
        from public.promotions p
        left join public.businesses b on b.id = p.business_id
        order by p.created_at desc
        limit 20
      `,
    ).then((r) => r.rows),
    pgQuery<{ c: number }>(
      `select count(*)::int as c from countrify.promotion_redemptions`,
    ).then((r) => r.rows[0]?.c ?? 0),
  ])

  const neighborsByBuilding = new Map<string, number>()
  for (const u of users) {
    if (u.role === 'vecino' && u.building_id) {
      neighborsByBuilding.set(u.building_id, (neighborsByBuilding.get(u.building_id) ?? 0) + 1)
    }
  }

  const businessPromoMap = new Map<string, { promos: number; redemptions: number }>()
  for (const p of promotions) {
    const current = businessPromoMap.get(p.business_id) ?? { promos: 0, redemptions: 0 }
    current.promos += 1
    current.redemptions += p.redemption_count
    businessPromoMap.set(p.business_id, current)
  }

  return {
    role: 'super_admin',
    totalUsers: users.length,
    totalVecinos: users.filter((u: any) => u.role === 'vecino').length,
    totalBuildings: buildings.length,
    totalBusinesses: businesses.length,
    totalPromotions: promotions.length,
    totalRedemptions: redemptionCountResult,
    buildings: buildings.map((b: any) => ({
      name: b.name,
      address: b.address ?? '',
      totalUnits: b.total_units ?? 0,
      registeredNeighbors: neighborsByBuilding.get(b.id) ?? 0,
    })),
    businesses: businesses.map((b: any) => {
      const stats = businessPromoMap.get(b.id) ?? { promos: 0, redemptions: 0 }
      return { name: b.name, category: b.category, promotionCount: stats.promos, redemptionCount: stats.redemptions }
    }),
    recentPromotions: promotions.slice(0, 15).map((p: any) => ({
      title: p.title,
      businessName: p.business_name ?? 'Negocio',
      discount: p.discount,
      expirationDate: p.expiration_date ?? '',
      isActive: Boolean(p.is_active),
    })),
  }
}
