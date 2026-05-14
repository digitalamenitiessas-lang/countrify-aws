import { notFound } from 'next/navigation'
import { MonthlyPlanilla } from '@/components/admin-backoffice/consorcio/monthly-planilla'
import { can, requireIAdmin } from '@/lib/auth'
import { getIAdminCashAccounts, getIAdminMesaState, getIAdminMonthlyGrid } from '@/lib/data'

export default async function PlanillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { context } = await requireIAdmin({ capability: 'consorcio.view' })

  const grid = await getIAdminMonthlyGrid(id, { monthsCount: 12 })
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

  return (
    <MonthlyPlanilla
      grid={grid}
      state={state}
      previousState={previousState ?? null}
      cashAccounts={cashAccounts}
      canEmit={canEmit}
      canManageRubros={canManageRubros}
      canRegisterPayments={canRegisterPayments}
    />
  )
}
