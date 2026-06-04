import Link from 'next/link'
import { ArrowRight, Users } from 'lucide-react'
import { ExpensesTable } from '@/components/admin-backoffice/gastos/expenses-table'
import { NewExpenseForm } from '@/components/admin-backoffice/gastos/new-expense-form'
import { PropertyFilterBanner } from '@/components/admin-backoffice/shell/property-filter-banner'
import { Button } from '@/components/ui/button'
import { can, requireIAdmin } from '@/lib/auth'
import { getIAdminCashAccounts, getIAdminExpensesInbox, getIAdminPortfolio, getIAdminProviders, getIAdminUnitsWithHolders } from '@/lib/data'
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

  // Unidades activas por consorcio, para el alta de "gasto particular" (cargo
  // asignado a una sola unidad, no prorrateado).
  const unitsByProperty: Record<string, { id: string; code: string; kind: string }[]> = {}
  // Cuentas (banco/caja) por consorcio, para poder pagar el gasto desde una
  // cuenta al cargarlo y mantener la caja al día.
  const accountsByProperty: Record<string, { id: string; name: string; isActive: boolean }[]> = {}
  if (canCreate && portfolio) {
    const [unitLists, accountLists] = await Promise.all([
      Promise.all(portfolio.properties.map((p) => getIAdminUnitsWithHolders(p.id))),
      Promise.all(portfolio.properties.map((p) => getIAdminCashAccounts(p.id))),
    ])
    portfolio.properties.forEach((p, i) => {
      unitsByProperty[p.id] = unitLists[i]
        .filter((u) => u.isActive)
        .map((u) => ({ id: u.id, code: u.code, kind: u.kind }))
      accountsByProperty[p.id] = accountLists[i].map((a) => ({
        id: a.id,
        name: a.name,
        isActive: a.isActive,
      }))
    })
  }

  return (
    <div className="space-y-6">
      <header className="glass-card rounded-2xl p-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-primary font-medium">Bandeja de gastos</p>
          <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Gastos a procesar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Filtra y prioriza gastos pendientes de revision o validacion documental.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/iadmin/proveedores">
            <Users className="w-3.5 h-3.5 mr-1.5" />
            Gestionar proveedores
            <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </Button>
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
          unitsByProperty={unitsByProperty}
          accountsByProperty={accountsByProperty}
        />
      ) : null}

      <ExpensesTable expenses={expenses} repeatPropertyId={currentPropertyId} />
    </div>
  )
}
