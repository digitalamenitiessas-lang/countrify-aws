import { pgQuery } from '@/lib/db/postgres'
import { sendNotificationEmail } from '@/lib/email/send'
import { renderLiquidationIssuedEmail } from '@/lib/email/templates/liquidation-issued'
import { renderLiquidationClosedEmail } from '@/lib/email/templates/liquidation-closed'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://countrify.com.ar'

interface RunContext {
  run_id: string
  managed_property_id: string
  building_id: string
  building_name: string
  property_display_name: string | null
  period_year: number
  period_month: number
}

async function getRunContext(runId: string): Promise<RunContext | null> {
  const res = await pgQuery<RunContext>(
    `select
       lr.id as run_id,
       lr.managed_property_id,
       mp.building_id,
       b.name as building_name,
       mp.display_name as property_display_name,
       ap.period_year,
       ap.period_month
     from countrify.iadmin_liquidation_runs lr
     join countrify.iadmin_accounting_periods ap on ap.id = lr.accounting_period_id
     join countrify.iadmin_managed_properties mp on mp.id = lr.managed_property_id
     join countrify.buildings b on b.id = mp.building_id
     where lr.id = $1
     limit 1`,
    [runId],
  )
  return res.rows[0] ?? null
}

interface ItemRow {
  item_id: string
  unit_id: string
  unit_code: string
  ordinary_amount: string
  extraordinary_amount: string
  previous_balance: string
  token: string | null
}

interface OwnerRow {
  unit_id: string
  profile_id: string
  email: string
  full_name: string
  relationship_type: 'vecino_principal'
}

// notifyLiquidationIssued: cuando la liquidacion pasa a 'issued', mail a
// cada propietario con su detalle + link publico (share token). Si el item
// no tiene token vigente, se skipea (no podemos mandar un link util).
export async function notifyLiquidationIssued(runId: string): Promise<void> {
  try {
    const ctx = await getRunContext(runId)
    if (!ctx) return

    // Items + token (left join porque puede no haberlo en casos legacy).
    const itemsRes = await pgQuery<ItemRow>(
      `select
         li.id as item_id,
         li.unit_id,
         u.code as unit_code,
         coalesce(li.ordinary_amount, 0)::text as ordinary_amount,
         coalesce(li.extraordinary_amount, 0)::text as extraordinary_amount,
         coalesce(li.previous_balance, 0)::text as previous_balance,
         t.token
       from countrify.iadmin_liquidation_items li
       join countrify.iadmin_units u on u.id = li.unit_id
       left join countrify.iadmin_item_share_tokens t
         on t.liquidation_item_id = li.id and t.revoked_at is null
       where li.liquidation_run_id = $1`,
      [runId],
    )
    const items = itemsRes.rows
    if (items.length === 0) return

    const unitIds = items.map((it: ItemRow) => it.unit_id)

    // Responsable del pago: vecino_principal. El vecino_adicional
    // (familiar/conviviente) no es responsable financiero.
    const ownersRes = await pgQuery<OwnerRow>(
      `select m.unit_id, m.profile_id, p.email, p.full_name,
              m.relationship_type::text as relationship_type
         from countrify.unit_profile_memberships m
         join countrify.profiles p on p.id = m.profile_id
        where m.unit_id = any($1::uuid[])
          and m.relationship_type = 'vecino_principal'
          and m.active = true`,
      [unitIds],
    )
    const ownersByUnit = new Map<string, OwnerRow[]>()
    for (const o of ownersRes.rows) {
      const arr = ownersByUnit.get(o.unit_id) ?? []
      arr.push(o)
      ownersByUnit.set(o.unit_id, arr)
    }

    const propertyName = ctx.property_display_name?.trim() || ctx.building_name

    // Cuenta activa del consorcio: se incluye en el cuerpo del mail para que
    // el vecino sepa dónde transferir. Si no hay cuenta activa, se omite el
    // bloque (la liquidación igual sale, pero el admin debería configurarla).
    const accountRes = await pgQuery<{
      name: string
      bank_name: string | null
      account_number: string | null
      cbu: string | null
      alias: string | null
    }>(
      `select name, bank_name, account_number, cbu, alias
         from countrify.iadmin_cash_accounts
        where managed_property_id = $1 and is_active = true
        order by created_at desc
        limit 1`,
      [ctx.managed_property_id],
    )
    const activeAccountRow = accountRes.rows[0] ?? null
    const paymentAccount = activeAccountRow
      ? {
          name: activeAccountRow.name,
          bankName: activeAccountRow.bank_name,
          accountNumber: activeAccountRow.account_number,
          cbu: activeAccountRow.cbu,
          alias: activeAccountRow.alias,
        }
      : null

    for (const item of items) {
      if (!item.token) continue // sin link publico, no mandamos
      const owners = ownersByUnit.get(item.unit_id) ?? []
      if (owners.length === 0) continue

      const ordinary = Number(item.ordinary_amount)
      const extra = Number(item.extraordinary_amount)
      const prev = Number(item.previous_balance)
      const subtotal = Math.round((ordinary + extra + prev) * 100) / 100
      const publicLink = `${SITE_URL}/l/${item.token}`

      for (const owner of owners) {
        const tpl = renderLiquidationIssuedEmail({
          recipientName: owner.full_name,
          propertyName,
          unitCode: item.unit_code,
          periodYear: ctx.period_year,
          periodMonth: ctx.period_month,
          ordinaryAmount: ordinary,
          extraordinaryAmount: extra,
          previousBalance: prev,
          subtotal,
          publicLink,
          paymentAccount,
        })
        await sendNotificationEmail({
          templateKey: 'liquidation_issued',
          to: { email: owner.email, profileId: owner.profile_id, fullName: owner.full_name },
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          preferenceKey: 'liquidations',
          // Dedup por run+propietario+unidad: si el admin re-emite la
          // liquidacion (issued -> draft -> issued), el token cambia y la
          // key tambien deberia variar para permitir nuevo envio. Pero el
          // caso normal es uno solo, asi que esto previene spam.
          idempotencyKey: `liquidation_issued:${runId}:${item.unit_id}:${owner.profile_id}`,
          metadata: {
            runId,
            unitId: item.unit_id,
            unitCode: item.unit_code,
            subtotal,
            periodYear: ctx.period_year,
            periodMonth: ctx.period_month,
          },
        })
      }
    }
  } catch (err) {
    console.error('[email/notifyLiquidationIssued] failed (non-blocking)', err)
  }
}

interface BuildingAdminRow {
  profile_id: string
  email: string
  full_name: string
}

async function getBuildingAdmins(buildingId: string): Promise<BuildingAdminRow[]> {
  const res = await pgQuery<BuildingAdminRow>(
    `select p.id as profile_id, p.email, p.full_name
       from countrify.building_admin_assignments baa
       join countrify.profiles p on p.id = baa.profile_id
      where baa.building_id = $1
        and p.role = 'consorcio_admin'`,
    [buildingId],
  )
  return res.rows
}

// notifyLiquidationClosed: cuando la liquidacion pasa a 'closed', mail a
// los consorcio_admins del edificio (no spam a propietarios porque el
// cierre es operativo, no afecta su saldo).
export async function notifyLiquidationClosed(
  runId: string,
  closedByProfileId: string,
): Promise<void> {
  try {
    const ctx = await getRunContext(runId)
    if (!ctx) return

    const admins = await getBuildingAdmins(ctx.building_id)
    if (admins.length === 0) return

    const changerRes = await pgQuery<{ full_name: string }>(
      `select full_name from countrify.profiles where id = $1 limit 1`,
      [closedByProfileId],
    )
    const closedByName = changerRes.rows[0]?.full_name ?? 'El administrador'

    const propertyName = ctx.property_display_name?.trim() || ctx.building_name
    const runDeepLink = `${SITE_URL}/iadmin/liquidaciones/${runId}`

    for (const admin of admins) {
      if (admin.profile_id === closedByProfileId) continue // no se notifica al que cerro
      const tpl = renderLiquidationClosedEmail({
        recipientName: admin.full_name,
        propertyName,
        periodYear: ctx.period_year,
        periodMonth: ctx.period_month,
        closedByName,
        runDeepLink,
      })
      await sendNotificationEmail({
        templateKey: 'liquidation_closed',
        to: { email: admin.email, profileId: admin.profile_id, fullName: admin.full_name },
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        preferenceKey: 'liquidations',
        idempotencyKey: `liquidation_closed:${runId}:${admin.profile_id}`,
        metadata: { runId, periodYear: ctx.period_year, periodMonth: ctx.period_month },
      })
    }
  } catch (err) {
    console.error('[email/notifyLiquidationClosed] failed (non-blocking)', err)
  }
}
