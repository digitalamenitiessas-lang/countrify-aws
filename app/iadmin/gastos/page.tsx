import { ExpensesTable } from '@/components/admin-backoffice/gastos/expenses-table'
import { NewExpenseForm } from '@/components/admin-backoffice/gastos/new-expense-form'
import { PropertyFilterBanner } from '@/components/admin-backoffice/shell/property-filter-banner'
import { can, requireIAdmin } from '@/lib/auth'
import { getIAdminExpensesInbox, getIAdminPortfolio, getIAdminProviders } from '@/lib/data'
import { getCurrentPropertyId } from '@/lib/iadmin/current-property'

export default async function GastosPage() {
  const { context } = await requireIAdmin({ capability: 'expenses.view' })

  const administrationId = context.primary?.administration.id
  if (!administrationId) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        Tu cuenta no tiene una administracion asignada todavia.
      </div>
    )
  }

  const [expensesAll, portfolio, providers] = await Promise.all([
    getIAdminExpensesInbox(administrationId),
    getIAdminPortfolio(administrationId),
    getIAdminProviders(administrationId),
  ])

  const allowedIds = (portfolio?.properties ?? []).map((p) => p.id)
  const currentPropertyId = await getCurrentPropertyId(allowedIds)
  const expenses = currentPropertyId
    ? expensesAll.filter((e) => e.managedPropertyId === currentPropertyId)
    : expensesAll
  const activeProperty = currentPropertyId
    ? portfolio?.properties.find((p) => p.id === currentPropertyId) ?? null
    : null

  const canCreate = can(context, 'expenses.create', { administrationId })

  return (
    <div className="space-y-6">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Bandeja de gastos</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Gastos a procesar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Filtra y prioriza gastos pendientes de revision o validacion documental.
        </p>
      </header>

      {activeProperty ? (
        <PropertyFilterBanner
          propertyName={activeProperty.displayName ?? activeProperty.buildingName}
          count={expenses.length}
          itemLabel="gastos"
        />
      ) : null}

      {canCreate && portfolio ? (
        <NewExpenseForm
          administrationId={administrationId}
          properties={portfolio.properties.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            buildingName: p.buildingName,
          }))}
          providers={providers.map((p) => ({
            id: p.id,
            name: p.name,
            isActive: p.isActive,
            defaultCategory: p.defaultCategory,
            defaultDescription: p.defaultDescription,
          }))}
        />
      ) : null}

      <ExpensesTable expenses={expenses} />
    </div>
  )
}
