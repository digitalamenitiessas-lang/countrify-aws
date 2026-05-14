import Link from 'next/link'
import type { IAdminExpenseStatus, IAdminExpenseSummary } from '@/lib/types'
import { Money } from '@/components/admin-backoffice/shared/money'

const EXPENSE_STATUS_LABELS: Record<IAdminExpenseStatus, string> = {
  draft: 'Borrador',
  pending_review: 'Pendiente revision',
  needs_doc: 'Falta documento',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  imputed: 'Imputado',
}

const EXPENSE_STATUS_TONE: Record<IAdminExpenseStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_review: 'bg-amber-100 text-amber-800',
  needs_doc: 'bg-orange-100 text-orange-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  imputed: 'bg-sky-100 text-sky-800',
}

export function ExpensesTable({ expenses }: { expenses: IAdminExpenseSummary[] }) {
  if (expenses.length === 0) {
    return (
      <div className="glass-card rounded-2xl px-5 py-12 text-center text-sm text-muted-foreground">
        No hay gastos cargados todavia.
      </div>
    )
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
            <th className="text-left px-5 py-3 font-medium">Gasto</th>
            <th className="text-left px-5 py-3 font-medium">Consorcio</th>
            <th className="text-left px-5 py-3 font-medium">Proveedor</th>
            <th className="text-left px-5 py-3 font-medium">Tipo</th>
            <th className="text-left px-5 py-3 font-medium">Estado</th>
            <th className="text-right px-5 py-3 font-medium">Monto</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.id} className="border-b border-border/30 last:border-0 hover:bg-muted/40">
              <td className="px-5 py-3">
                <Link href={`/iadmin/gastos/${expense.id}`} className="font-medium text-foreground hover:text-primary">
                  {expense.description}
                </Link>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {expense.issuedAt ?? expense.createdAt.slice(0, 10)}
                  {expense.pendingExtraction ? ' · doc por validar' : ''}
                </div>
              </td>
              <td className="px-5 py-3 text-muted-foreground">{expense.managedPropertyName}</td>
              <td className="px-5 py-3 text-muted-foreground">{expense.providerName ?? '—'}</td>
              <td className="px-5 py-3">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  expense.expenseKind === 'extraordinaria'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {expense.expenseKind === 'extraordinaria' ? 'Extraordinaria' : 'Ordinaria'}
                </span>
              </td>
              <td className="px-5 py-3">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${EXPENSE_STATUS_TONE[expense.status]}`}>
                  {EXPENSE_STATUS_LABELS[expense.status]}
                </span>
              </td>
              <td className="px-5 py-3 text-right tabular-nums text-foreground">
                <Money amount={expense.amount} currency={expense.currency} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
