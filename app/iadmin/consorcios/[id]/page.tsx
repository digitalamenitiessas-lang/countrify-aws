import { notFound } from 'next/navigation'
import { MonthlyPlanilla } from '@/components/admin-backoffice/consorcio/monthly-planilla'
import { can, requireIAdmin } from '@/lib/auth'
import { getIAdminCashAccounts, getIAdminMesaState, getIAdminMonthlyGrid } from '@/lib/data'

function parsePeriodParam(raw: string | undefined | null): { year: number; month: number } | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})$/.exec(raw)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (year < 2020 || year > 2100 || month < 1 || month > 12) return null
  return { year, month }
}

export const dynamic = 'force-dynamic'

export default async function PlanillaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ period?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const { context } = await requireIAdmin({ capability: 'consorcio.view' })

  const selectedPeriod = parsePeriodParam(sp.period)
  const grid = await getIAdminMonthlyGrid(id, {
    monthsCount: 12,
    targetYear: selectedPeriod?.year,
    targetMonth: selectedPeriod?.month,
  })
  if (!grid) notFound()

  const currentMonth = grid.months[grid.months.length - 1]
  const previousMonth = grid.months[grid.months.length - 2]

  const [state, cashAccounts, previousState] = await Promise.all([
    getIAdminMesaState(id, currentMonth.year, currentMonth.month),
    getIAdminCashAccounts(id),
    previousMonth
      ? getIAdminMesaState(id, previousMonth.year, previousMonth.month)
      : Promise.resolve(null),
  ])
  if (!state) notFound()

  const canEmit = can(context, 'liquidations.create', { administrationId: grid.administrationId })
  const canManageRubros = can(context, 'providers.manage', { administrationId: grid.administrationId })
  const canRegisterPayments = can(context, 'collections.register', {
    administrationId: grid.administrationId,
  })
  const liquidationCaps = (
    ['liquidations.view', 'liquidations.create', 'liquidations.close'] as const
  ).filter((cap) => can(context, cap, { administrationId: grid.administrationId }))

  return (
    <MonthlyPlanilla
      grid={grid}
      state={state}
      previousState={previousState ?? null}
      cashAccounts={cashAccounts}
      canEmit={canEmit}
      canManageRubros={canManageRubros}
      canRegisterPayments={canRegisterPayments}
      liquidationCaps={liquidationCaps}
    />
  )
}
