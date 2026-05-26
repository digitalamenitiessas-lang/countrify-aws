/**
 * Seed de datos demo para validar cobranzas + reminders en Country Demo.
 *
 * Uso:
 *   node scripts/seed-cobranzas-demo.js              → seed fase 1 (período + gastos + cash account)
 *   node scripts/seed-cobranzas-demo.js --payment    → fase 2 (pago parcial) — correr DESPUÉS de emitir el run en la UI
 *
 * Fase 1 deja:
 *   - 1 accounting_period (2026-05) en estado 'open'
 *   - 2 gastos (1 ordinario "Mantenimiento general" $300.000, 1 extraordinario "Reparación tanque" $150.000)
 *   - 1 cash_account "Cuenta principal demo" si no existe
 *
 * Después en la UI: /iadmin/liquidaciones?propertyId=<id> → "Recalcular desde gastos" →
 * "Calcular" → "Emitir" (con 2 due_dates).
 *
 * Fase 2 (--payment):
 *   - Inserta 1 pago parcial contra la primera unidad ($50.000 de los ~150k que debería)
 *   - Para ver el bucket "partial" en cobranzas
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const credentialsFile = 'C:\\tmp\\citify-rds-credentials.txt'

function parseCredentialsFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const raw = fs.readFileSync(filePath, 'utf8')
  return raw.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return acc
    const [key, ...rest] = trimmed.split('=')
    acc[key] = rest.join('=')
    return acc
  }, {})
}

function getDbConfig() {
  const fileCreds = parseCredentialsFile(credentialsFile)
  return {
    host: process.env.DB_HOST || fileCreds.DB_HOST || 'citify-prod-db.cyhi4wiiax9v.us-east-1.rds.amazonaws.com',
    port: Number(process.env.DB_PORT || fileCreds.DB_PORT || 5432),
    database: process.env.DB_NAME || fileCreds.DB_NAME || 'countrify',
    user: process.env.DB_USER || process.env.DB_USERNAME || fileCreds.DB_USERNAME || 'countrify_app',
    password: process.env.DB_PASSWORD || fileCreds.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'disable' ? false : { rejectUnauthorized: false },
  }
}

async function findCountryDemoProperty(client) {
  const result = await client.query(
    `select mp.id, mp.administration_id, b.name as building_name
     from countrify.iadmin_managed_properties mp
     left join countrify.buildings b on b.id = mp.building_id
     where b.name ilike '%country demo%' or b.name ilike '%countrydemo%'
     limit 1`,
  )
  return result.rows[0] ?? null
}

async function ensureAccountingPeriod(client, propertyId, year, month) {
  const existing = await client.query(
    `select id, status from countrify.iadmin_accounting_periods
     where managed_property_id = $1 and period_year = $2 and period_month = $3`,
    [propertyId, year, month],
  )
  if (existing.rows[0]) {
    console.log(`  ✓ Período ${year}-${month} ya existe (id=${existing.rows[0].id}, status=${existing.rows[0].status})`)
    return existing.rows[0].id
  }
  const inserted = await client.query(
    `insert into countrify.iadmin_accounting_periods (managed_property_id, period_year, period_month, status)
     values ($1, $2, $3, 'open')
     returning id`,
    [propertyId, year, month],
  )
  console.log(`  + Creado período ${year}-${month} (id=${inserted.rows[0].id})`)
  return inserted.rows[0].id
}

async function listExpenseCategories(client, administrationId) {
  const result = await client.query(
    `select id, name, kind from countrify.iadmin_expense_categories
     where administration_id = $1
     order by name asc`,
    [administrationId],
  )
  return result.rows
}

async function ensureExpense(client, propertyId, periodId, categoryId, amount, description, kind) {
  const existing = await client.query(
    `select id from countrify.iadmin_expenses
     where managed_property_id = $1 and accounting_period_id = $2 and description = $3
     limit 1`,
    [propertyId, periodId, description],
  )
  if (existing.rows[0]) {
    console.log(`  ✓ Gasto "${description}" ya existe`)
    return existing.rows[0].id
  }
  const inserted = await client.query(
    `insert into countrify.iadmin_expenses
       (managed_property_id, accounting_period_id, expense_category_id, amount, description, kind, expense_date, status)
     values ($1, $2, $3, $4, $5, $6, current_date, 'approved')
     returning id`,
    [propertyId, periodId, categoryId, amount, description, kind],
  )
  console.log(`  + Gasto "${description}" $${amount} (id=${inserted.rows[0].id})`)
  return inserted.rows[0].id
}

async function ensureCashAccount(client, propertyId) {
  const existing = await client.query(
    `select id, name from countrify.iadmin_cash_accounts
     where managed_property_id = $1 and is_active = true
     order by created_at asc limit 1`,
    [propertyId],
  )
  if (existing.rows[0]) {
    console.log(`  ✓ Cash account activa ya existe: "${existing.rows[0].name}"`)
    return existing.rows[0].id
  }
  const inserted = await client.query(
    `insert into countrify.iadmin_cash_accounts
       (managed_property_id, name, kind, is_active, bank_name)
     values ($1, 'Cuenta principal demo', 'bank', true, 'Banco Demo')
     returning id`,
    [propertyId],
  )
  console.log(`  + Cash account creada (id=${inserted.rows[0].id})`)
  return inserted.rows[0].id
}

async function seedFase1(client, property) {
  console.log(`\n=== FASE 1: período + gastos + cash account ===`)
  console.log(`Property: ${property.id} (${property.building_name})`)

  const periodId = await ensureAccountingPeriod(client, property.id, 2026, 5)
  const cats = await listExpenseCategories(client, property.administration_id)
  if (cats.length === 0) {
    throw new Error('No hay categorías de gasto en esta administración. Cargá al menos una desde /iadmin/gastos primero.')
  }
  const ordinary = cats.find((c) => c.kind === 'ordinary') ?? cats[0]
  const extraordinary = cats.find((c) => c.kind === 'extraordinary') ?? cats[0]
  console.log(`  Categorías: ordinary="${ordinary.name}" extraordinary="${extraordinary.name}"`)

  await ensureExpense(client, property.id, periodId, ordinary.id, 300000, 'Mantenimiento general (demo)', 'ordinary')
  await ensureExpense(client, property.id, periodId, extraordinary.id, 150000, 'Reparación tanque (demo)', 'extraordinary')
  await ensureCashAccount(client, property.id)

  console.log(`\n✅ Fase 1 lista. Próximos pasos manuales en la UI:`)
  console.log(`   1. Login como admin@country-demo.com (Demo2026!)`)
  console.log(`   2. /iadmin/liquidaciones?propertyId=${property.id}`)
  console.log(`   3. Botón "Recalcular desde gastos" → "Calcular" → "Emitir" (con 2 due_dates, ej. 10/06 y 20/06).`)
  console.log(`   4. Volvé a correr: node scripts/seed-cobranzas-demo.js --payment`)
}

async function seedFase2Payment(client, property) {
  console.log(`\n=== FASE 2: pago parcial ===`)
  const run = await client.query(
    `select r.id, ap.period_year, ap.period_month, r.status::text as status
     from countrify.iadmin_liquidation_runs r
     left join countrify.iadmin_accounting_periods ap on ap.id = r.accounting_period_id
     where r.managed_property_id = $1 and r.status in ('issued', 'closed')
     order by r.generated_at desc limit 1`,
    [property.id],
  )
  if (!run.rows[0]) {
    throw new Error('No hay runs emitidos/cerrados. Emití uno primero desde /iadmin/liquidaciones.')
  }
  console.log(`  Run encontrado: ${run.rows[0].id} (${run.rows[0].period_year}-${run.rows[0].period_month}, ${run.rows[0].status})`)

  const items = await client.query(
    `select i.id, u.code, i.ordinary_amount, i.extraordinary_amount, i.previous_balance
     from countrify.iadmin_liquidation_items i
     left join countrify.iadmin_units u on u.id = i.unit_id
     where i.liquidation_run_id = $1
     order by u.code asc`,
    [run.rows[0].id],
  )
  if (items.rows.length === 0) {
    throw new Error('El run no tiene items. Algo salió mal al emitir.')
  }
  const firstItem = items.rows[0]
  const subtotal =
    Number(firstItem.ordinary_amount) + Number(firstItem.extraordinary_amount) + Number(firstItem.previous_balance ?? 0)
  const paymentAmount = Math.round((subtotal / 3) * 100) / 100
  console.log(`  Primer item: unidad ${firstItem.code}, subtotal $${subtotal.toFixed(2)}, voy a pagar $${paymentAmount} (~33%)`)

  const cashAccount = await client.query(
    `select id from countrify.iadmin_cash_accounts where managed_property_id = $1 and is_active = true limit 1`,
    [property.id],
  )
  if (!cashAccount.rows[0]) throw new Error('No hay cash_account activa.')

  const existing = await client.query(
    `select id from countrify.iadmin_payments
     where liquidation_item_id = $1 and notes = 'Demo seed partial payment'`,
    [firstItem.id],
  )
  if (existing.rows[0]) {
    console.log(`  ✓ Pago demo ya existe (id=${existing.rows[0].id})`)
    return
  }

  const inserted = await client.query(
    `insert into countrify.iadmin_payments
       (liquidation_item_id, cash_account_id, amount, method, paid_at, notes, status)
     values ($1, $2, $3, 'transferencia', current_date - interval '2 days', 'Demo seed partial payment', 'confirmed')
     returning id`,
    [firstItem.id, cashAccount.rows[0].id, paymentAmount],
  )
  console.log(`  + Pago $${paymentAmount} insertado (id=${inserted.rows[0].id})`)
  console.log(`\n✅ Fase 2 lista. Andá a /iadmin/cobranzas?propertyId=${property.id} y deberías ver:`)
  console.log(`   - Unidad ${firstItem.code} en bucket "Pago parcial"`)
  console.log(`   - Resto de unidades en "Sin pagar"`)
}

async function main() {
  const args = process.argv.slice(2)
  const fase2 = args.includes('--payment')

  const config = getDbConfig()
  if (!config.password) {
    throw new Error(`Falta DB_PASSWORD (env o ${credentialsFile})`)
  }
  console.log(`Conectando a ${config.host}/${config.database} como ${config.user}...`)
  const client = new Client(config)
  await client.connect()

  try {
    const property = await findCountryDemoProperty(client)
    if (!property) {
      throw new Error('No encontré ningún managed_property con building "Country Demo"')
    }

    if (fase2) {
      await seedFase2Payment(client, property)
    } else {
      await seedFase1(client, property)
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})
