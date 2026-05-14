import type { IAdminCapability, IAdminOperationalRole } from '@/lib/types'

export const IADMIN_CAPABILITIES: readonly IAdminCapability[] = [
  'portfolio.view',
  'consorcio.view',
  'consorcio.edit',
  'consorcio.legal.edit',
  'units.manage',
  'unit_groups.manage',
  'holders.manage',
  'providers.manage',
  'expenses.view',
  'expenses.create',
  'expenses.approve',
  'expenses.mark_paid',
  'documents.upload',
  'documents.validate',
  'liquidations.view',
  'liquidations.create',
  'liquidations.close',
  'collections.view',
  'communications.send',
  'reports.view',
  'reports.sensitive.view',
  'admin.legal.edit',
  'admin.settings.manage',
  'cash_accounts.view',
  'cash_accounts.manage',
  'collections.register',
  'collections.void',
  'liquidations.share',
  'expenses.recurring.manage',
  'reminders.generate',
  'reminders.send',
] as const

export const IADMIN_CAPABILITY_LABELS: Record<IAdminCapability, string> = {
  'portfolio.view': 'Ver cartera',
  'consorcio.view': 'Ver consorcio',
  'consorcio.edit': 'Editar consorcio',
  'consorcio.legal.edit': 'Editar datos legales del consorcio',
  'units.manage': 'Gestionar unidades',
  'unit_groups.manage': 'Agrupar unidades como unidad de cobro',
  'holders.manage': 'Gestionar titulares',
  'providers.manage': 'Gestionar proveedores',
  'expenses.view': 'Ver gastos',
  'expenses.create': 'Cargar gastos',
  'expenses.approve': 'Aprobar gastos',
  'expenses.mark_paid': 'Marcar gasto como pagado',
  'documents.upload': 'Subir documentos',
  'documents.validate': 'Validar extracciones IA',
  'liquidations.view': 'Ver liquidaciones',
  'liquidations.create': 'Generar liquidaciones',
  'liquidations.close': 'Cerrar liquidaciones',
  'collections.view': 'Ver cobranzas',
  'communications.send': 'Emitir comunicaciones',
  'reports.view': 'Ver reportes',
  'reports.sensitive.view': 'Ver reportes sensibles',
  'admin.legal.edit': 'Editar datos legales de la administracion',
  'admin.settings.manage': 'Configurar administracion',
  'cash_accounts.view': 'Ver cuentas bancarias',
  'cash_accounts.manage': 'Gestionar cuentas bancarias',
  'collections.register': 'Registrar pagos de vecinos',
  'collections.void': 'Anular pagos',
  'liquidations.share': 'Compartir liquidación con vecinos (link público)',
  'expenses.recurring.manage': 'Gestionar facturas recurrentes',
  'reminders.generate': 'Generar recordatorios automaticos',
  'reminders.send': 'Enviar/marcar recordatorios',
}

export const IADMIN_OPERATIONAL_ROLES: readonly IAdminOperationalRole[] = [
  'titular',
  'contable',
  'asistente',
  'documental',
] as const

export const IADMIN_OPERATIONAL_ROLE_LABELS: Record<IAdminOperationalRole, string> = {
  titular: 'Administrador titular',
  contable: 'Operador contable',
  asistente: 'Asistente administrativo',
  documental: 'Operador documental',
}

const FULL = IADMIN_CAPABILITIES.slice()

export const IADMIN_ROLE_PRESETS: Record<IAdminOperationalRole, IAdminCapability[]> = {
  titular: FULL,
  contable: [
    'portfolio.view',
    'consorcio.view',
    'consorcio.edit',
    'consorcio.legal.edit',
    'units.manage',
    'unit_groups.manage',
    'holders.manage',
    'providers.manage',
    'expenses.view',
    'expenses.create',
    'expenses.approve',
    'expenses.mark_paid',
    'documents.upload',
    'documents.validate',
    'liquidations.view',
    'liquidations.create',
    'collections.view',
    'reports.view',
    'cash_accounts.view',
    'cash_accounts.manage',
    'collections.register',
    'collections.void',
    'liquidations.share',
    'expenses.recurring.manage',
    'reminders.generate',
    'reminders.send',
  ],
  asistente: [
    'portfolio.view',
    'consorcio.view',
    'expenses.view',
    'expenses.create',
    'documents.upload',
    'communications.send',
  ],
  documental: [
    'portfolio.view',
    'consorcio.view',
    'expenses.view',
    'documents.upload',
    'documents.validate',
  ],
}

export function capabilitiesForRole(operationalRole: string): IAdminCapability[] {
  if (operationalRole in IADMIN_ROLE_PRESETS) {
    return IADMIN_ROLE_PRESETS[operationalRole as IAdminOperationalRole]
  }
  return []
}
