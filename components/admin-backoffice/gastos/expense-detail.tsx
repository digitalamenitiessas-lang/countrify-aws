import type {
  IAdminCapability,
  IAdminCashAccountWithBalance,
  IAdminExpenseDocument,
  IAdminExpenseSummary,
  IAdminExpenseStatus,
} from '@/lib/types'
import { Money } from '@/components/admin-backoffice/shared/money'
import { ExpenseStatusActions } from '@/components/admin-backoffice/gastos/expense-status-actions'
import { ExpenseEditForm } from '@/components/admin-backoffice/gastos/expense-edit-form'

const STATUS_LABELS: Record<IAdminExpenseStatus, string> = {
  draft: 'Borrador',
  pending_review: 'Pendiente revision',
  needs_doc: 'Falta documento',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  imputed: 'Imputado',
}

const STATUS_TONE: Record<IAdminExpenseStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_review: 'bg-amber-100 text-amber-800',
  needs_doc: 'bg-orange-100 text-orange-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  imputed: 'bg-sky-100 text-sky-800',
}

type Props = {
  expense: IAdminExpenseSummary
  documents: IAdminExpenseDocument[]
  payment: { paid: boolean; paidAt: string | null; paidFromAccountName: string | null }
  cashAccounts: IAdminCashAccountWithBalance[]
  userCapabilities: IAdminCapability[]
  canEdit: boolean
  editBlockedReason: string | null
}

export function ExpenseDetail({
  expense,
  userCapabilities,
  canEdit,
  editBlockedReason,
}: Props) {
  const caps = new Set(userCapabilities)
  const canEditExpense = caps.has('expenses.create')

  return (
    <div className="space-y-6">
      <section className="glass-card rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-primary font-medium">Gasto</p>
            <h1 className="font-serif text-2xl font-bold text-foreground mt-1">{expense.description}</h1>
          </div>
          <span className={`shrink-0 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[expense.status]}`}>
            {STATUS_LABELS[expense.status]}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <Field label="Consorcio" value={expense.managedPropertyName} />
          <Field label="Proveedor" value={expense.providerName ?? '—'} />
          <Field label="Categoria" value={expense.category ?? '—'} />
          <Field label="Emitido" value={expense.issuedAt ?? '—'} />
          <div className="col-span-2 lg:col-span-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Monto</div>
            <div className="font-serif text-xl font-bold text-foreground mt-1 tabular-nums">
              <Money amount={expense.amount} currency={expense.currency} />
            </div>
          </div>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-foreground">Acciones del gasto</h2>
        </div>
        <ExpenseStatusActions
          expenseId={expense.id}
          currentStatus={expense.status}
          userCapabilities={userCapabilities}
        />

        {canEditExpense ? (
          <div className="pt-4 border-t border-border/40">
            <ExpenseEditForm
              expenseId={expense.id}
              initial={{
                description: expense.description,
                amount: expense.amount,
                category: expense.category,
                issuedAt: expense.issuedAt,
                expenseKind: expense.expenseKind,
              }}
              canEdit={canEdit}
              blockedReason={editBlockedReason}
            />
          </div>
        ) : null}
      </section>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-foreground mt-0.5">{value}</div>
    </div>
  )
}
