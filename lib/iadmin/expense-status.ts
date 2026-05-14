import type { IAdminCapability, IAdminExpenseStatus } from '@/lib/types'

type Transition = {
  to: IAdminExpenseStatus
  label: string
  requires: IAdminCapability
}

export const EXPENSE_TRANSITIONS: Record<IAdminExpenseStatus, Transition[]> = {
  draft: [
    { to: 'pending_review', label: 'Enviar a revision', requires: 'expenses.create' },
    { to: 'needs_doc', label: 'Marcar falta documento', requires: 'expenses.create' },
  ],
  needs_doc: [
    { to: 'pending_review', label: 'Documentacion cargada', requires: 'expenses.create' },
  ],
  pending_review: [
    { to: 'approved', label: 'Aprobar', requires: 'expenses.approve' },
    { to: 'rejected', label: 'Rechazar', requires: 'expenses.approve' },
    { to: 'needs_doc', label: 'Pedir documentacion', requires: 'expenses.approve' },
  ],
  approved: [
    { to: 'imputed', label: 'Imputar al periodo', requires: 'liquidations.create' },
  ],
  rejected: [],
  imputed: [],
}

export function allowedTransitions(
  status: IAdminExpenseStatus,
  capabilities: ReadonlySet<IAdminCapability>,
): Transition[] {
  return EXPENSE_TRANSITIONS[status].filter((t) => capabilities.has(t.requires))
}

export function canTransition(
  from: IAdminExpenseStatus,
  to: IAdminExpenseStatus,
  capabilities: ReadonlySet<IAdminCapability>,
): boolean {
  return EXPENSE_TRANSITIONS[from].some((t) => t.to === to && capabilities.has(t.requires))
}
