import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ClaimsValidator, type ClaimRowView } from '@/components/admin-backoffice/cobranzas/claims-validator'
import { can, requireIAdmin } from '@/lib/auth'
import { getIAdminCashAccounts, getIAdminPortfolio } from '@/lib/data'
import { pgQuery } from '@/lib/db/postgres'
import { getCurrentPropertyId } from '@/lib/iadmin/current-property'

export const dynamic = 'force-dynamic'

interface PendingClaimRow {
  id: string
  managed_property_id: string
  unit_code: string
  reporter_name: string | null
  reporter_email: string | null
  amount: string
  paid_at_claimed: string
  method: string | null
  reference: string | null
  notes: string | null
  document_object_key: string | null
  liquidation_item_id: string | null
  period_year: number | null
  period_month: number | null
  created_at: string
}

async function getPendingClaims(propertyId: string): Promise<ClaimRowView[]> {
  const res = await pgQuery<PendingClaimRow>(
    `
      select
        c.id,
        c.managed_property_id,
        u.code as unit_code,
        p.full_name as reporter_name,
        p.email as reporter_email,
        c.amount::text as amount,
        c.paid_at_claimed::text as paid_at_claimed,
        c.method,
        c.reference,
        c.notes,
        c.document_object_key,
        c.liquidation_item_id,
        ap.period_year,
        ap.period_month,
        c.created_at::text as created_at
      from public.iadmin_payment_claims c
      join public.iadmin_units u on u.id = c.unit_id
      join public.profiles p on p.id = c.reporter_profile_id
      left join public.iadmin_liquidation_items li on li.id = c.liquidation_item_id
      left join public.iadmin_liquidation_runs lr on lr.id = li.liquidation_run_id
      left join public.iadmin_accounting_periods ap on ap.id = lr.accounting_period_id
      where c.managed_property_id = $1
        and c.status = 'pending'
      order by c.created_at desc
    `,
    [propertyId],
  )

  return res.rows.map((r) => ({
    id: r.id,
    unitCode: r.unit_code,
    reporterName: r.reporter_name,
    reporterEmail: r.reporter_email,
    amount: Number(r.amount),
    paidAtClaimed: r.paid_at_claimed,
    method: r.method,
    reference: r.reference,
    notes: r.notes,
    hasDocument: Boolean(r.document_object_key),
    liquidationItemId: r.liquidation_item_id,
    liquidationPeriod:
      r.period_year && r.period_month
        ? `${String(r.period_month).padStart(2, '0')}/${r.period_year}`
        : null,
    createdAt: r.created_at,
  }))
}

export default async function ValidarClaimsPage() {
  const { context } = await requireIAdmin({ capability: 'collections.view' })

  const administrationId = context.primary?.administration.id
  if (!administrationId) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
        Tu cuenta no tiene una administración asignada todavía.
      </div>
    )
  }

  const portfolio = await getIAdminPortfolio(administrationId)
  const properties = portfolio?.properties ?? []
  const allowedIds = properties.map((p) => p.id)
  const currentPropertyId = await getCurrentPropertyId(allowedIds)

  if (!currentPropertyId) {
    return (
      <div className="space-y-4">
        <header className="glass-card rounded-2xl p-6">
          <p className="text-xs uppercase tracking-wider text-primary font-medium">Cobranzas</p>
          <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Validar comprobantes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Elegí un edificio arriba (selector en el header) para ver los reportes pendientes.
          </p>
        </header>
      </div>
    )
  }

  const [claims, cashAccounts] = await Promise.all([
    getPendingClaims(currentPropertyId),
    getIAdminCashAccounts(currentPropertyId),
  ])

  const canValidate = can(context, 'collections.validate_claims', { administrationId })

  return (
    <div className="space-y-4">
      <header className="glass-card rounded-2xl p-6">
        <Link
          href="/iadmin/cobranzas"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3 h-3" />
          Volver a cobranzas
        </Link>
        <p className="text-xs uppercase tracking-wider text-primary font-medium mt-2">Cobranzas</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">
          Validar comprobantes ({claims.length})
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reportes de pago enviados por los vecinos. Revisá el comprobante y confirmá para
          acreditar el pago en el sistema.
        </p>
      </header>

      <ClaimsValidator claims={claims} cashAccounts={cashAccounts} canValidate={canValidate} />
    </div>
  )
}
