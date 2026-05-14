import type { IAdminCapability, IAdminLiquidationStatus } from '@/lib/types'

type Transition = {
  to: IAdminLiquidationStatus
  label: string
  requires: IAdminCapability
  destructive?: boolean
}

export const LIQUIDATION_TRANSITIONS: Record<IAdminLiquidationStatus, Transition[]> = {
  draft: [
    { to: 'calculated', label: 'Calcular', requires: 'liquidations.create' },
  ],
  calculated: [
    { to: 'issued', label: 'Emitir', requires: 'liquidations.create' },
    { to: 'draft', label: 'Volver a borrador', requires: 'liquidations.create' },
  ],
  issued: [
    { to: 'closed', label: 'Cerrar', requires: 'liquidations.close' },
    { to: 'calculated', label: 'Reabrir para recalcular', requires: 'liquidations.close', destructive: true },
  ],
  closed: [
    { to: 'calculated', label: 'Reabrir cerrada', requires: 'liquidations.close', destructive: true },
  ],
}

export function allowedLiquidationTransitions(
  status: IAdminLiquidationStatus,
  capabilities: ReadonlySet<IAdminCapability>,
): Transition[] {
  return LIQUIDATION_TRANSITIONS[status].filter((t) => capabilities.has(t.requires))
}

export function canLiquidationTransition(
  from: IAdminLiquidationStatus,
  to: IAdminLiquidationStatus,
  capabilities: ReadonlySet<IAdminCapability>,
): boolean {
  return LIQUIDATION_TRANSITIONS[from].some((t) => t.to === to && capabilities.has(t.requires))
}
