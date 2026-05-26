// Verifica el estado de runs/pagos de Country Los Naranjos.
// Se corre via `aws ecs execute-command` dentro del task.
const { Client } = require('pg')
const c = new Client({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
})
const propertyId = '54cd08f9-32ef-4f40-bc99-77c6bb57d275'
;(async () => {
  await c.connect()
  const runs = await c.query(
    `select r.id, r.status::text as status, ap.period_year, ap.period_month,
            (select count(*) from countrify.iadmin_liquidation_items i where i.liquidation_run_id=r.id) as items,
            (select count(*) from countrify.iadmin_payments p
             join countrify.iadmin_liquidation_items i on i.id=p.liquidation_item_id
             where i.liquidation_run_id=r.id) as pagos
     from countrify.iadmin_liquidation_runs r
     left join countrify.iadmin_accounting_periods ap on ap.id=r.accounting_period_id
     where r.managed_property_id=$1`,
    [propertyId],
  )
  console.log('RUNS:')
  console.table(runs.rows)
  const units = await c.query(
    `select count(*) as units from countrify.iadmin_units where managed_property_id=$1`,
    [propertyId],
  )
  console.log('UNITS:', units.rows[0].units)
  const cash = await c.query(
    `select id, name, is_active from countrify.iadmin_cash_accounts where managed_property_id=$1`,
    [propertyId],
  )
  console.log('CASH ACCOUNTS:')
  console.table(cash.rows)
  await c.end()
})()
