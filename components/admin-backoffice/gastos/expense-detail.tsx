import type {
  IAdminAIExtractionStatus,
  IAdminCapability,
  IAdminCashAccountWithBalance,
  IAdminExpenseDocument,
  IAdminExpenseSummary,
  IAdminExpenseStatus,
} from '@/lib/types'
import { Money } from '@/components/admin-backoffice/shared/money'
import { ExpenseStatusActions } from '@/components/admin-backoffice/gastos/expense-status-actions'
import { ExpenseDocumentUploader } from '@/components/admin-backoffice/gastos/expense-document-uploader'
import { AIExtractionActions } from '@/components/admin-backoffice/gastos/ai-extraction-actions'
import { ExpensePayAction } from '@/components/admin-backoffice/gastos/expense-pay-action'

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

const EXTRACTION_STATUS_LABELS: Record<IAdminAIExtractionStatus, string> = {
  pending: 'Pendiente',
  suggested: 'Sugerida por IA',
  validated: 'Validada',
  rejected: 'Rechazada',
}

const EXTRACTION_STATUS_TONE: Record<IAdminAIExtractionStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  suggested: 'bg-amber-100 text-amber-800',
  validated: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
}

type Props = {
  expense: IAdminExpenseSummary
  documents: IAdminExpenseDocument[]
  payment: { paid: boolean; paidAt: string | null; paidFromAccountName: string | null }
  cashAccounts: IAdminCashAccountWithBalance[]
  userCapabilities: IAdminCapability[]
}

export function ExpenseDetail({ expense, documents, payment, cashAccounts, userCapabilities }: Props) {
  const caps = new Set(userCapabilities)
  const canUpload = caps.has('documents.upload')
  const canValidate = caps.has('documents.validate')
  const canMarkPaid = caps.has('expenses.mark_paid')
  const canShowPaymentArea = expense.status !== 'draft' && expense.status !== 'rejected'

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

        {canShowPaymentArea && canMarkPaid ? (
          <div className="pt-4 border-t border-border/40 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-foreground">Pago al proveedor</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Registrar el pago crea un movimiento en la cuenta seleccionada.
                </p>
              </div>
            </div>
            <ExpensePayAction
              expenseId={expense.id}
              alreadyPaid={payment.paid}
              paidFromAccountName={payment.paidFromAccountName}
              paidAt={payment.paidAt}
              cashAccounts={cashAccounts}
            />
          </div>
        ) : null}
      </section>

      <section className="glass-card rounded-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-border/40 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-foreground">Documentos & extraccion IA</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              La extraccion documental es asistida. Requiere validacion humana antes de imputar.
            </p>
          </div>
          {canUpload ? (
            <ExpenseDocumentUploader
              expenseId={expense.id}
            />
          ) : null}
        </header>

        {documents.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            Aun no se cargaron comprobantes. {canUpload ? 'Subi uno desde el boton de arriba.' : 'Tu rol no puede subir documentos.'}
          </div>
        ) : (
          <ul className="divide-y divide-border/30">
            {documents.map((doc) => {
              const extraction = doc.extraction
              const fields = (extraction?.suggestedFields ?? {}) as Record<string, unknown>
              const fieldEntries = Object.entries(fields)
              return (
                <li key={doc.id} className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{doc.fileName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {doc.mimeType ?? 'archivo'} · {doc.uploadedAt.slice(0, 10)}
                        {doc.sizeBytes ? ` · ${formatBytes(doc.sizeBytes)}` : ''}
                      </div>
                    </div>
                    {extraction ? (
                      <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${EXTRACTION_STATUS_TONE[extraction.status]}`}>
                        {EXTRACTION_STATUS_LABELS[extraction.status]}
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                        sin extraccion
                      </span>
                    )}
                  </div>

                  {extraction ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        {fieldEntries.length === 0 ? (
                          <div className="text-muted-foreground italic">
                            La extraccion aun no produjo campos sugeridos.
                          </div>
                        ) : (
                          fieldEntries.map(([key, value]) => (
                            <div key={key} className="rounded-lg bg-muted/40 px-3 py-2">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{key}</div>
                              <div className="text-foreground break-words">{String(value ?? '—')}</div>
                            </div>
                          ))
                        )}
                        {extraction.validationNotes ? (
                          <div className="md:col-span-2 rounded-lg border border-border/40 px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Notas</div>
                            <div className="text-foreground">{extraction.validationNotes}</div>
                          </div>
                        ) : null}
                      </div>

                      {extraction.status !== 'validated' && extraction.status !== 'rejected' ? (
                        <AIExtractionActions
                          extractionId={extraction.id}
                          currentStatus={extraction.status}
                          canValidate={canValidate}
                        />
                      ) : null}
                    </>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}
