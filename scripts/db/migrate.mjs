#!/usr/bin/env node
/**
 * Runner de migraciones con tabla de control.
 *
 * Aplica, en orden alfabetico, las migraciones de db/bootstrap/migrations/ que
 * todavia no estan registradas en countrify.schema_migrations. Cada migracion
 * corre en su propia transaccion y aborta al primer error.
 *
 *   node scripts/db/migrate.mjs              aplica lo pendiente
 *   node scripts/db/migrate.mjs --dry-run    lista lo pendiente, no aplica nada
 *   node scripts/db/migrate.mjs --baseline   marca todo como aplicado sin correrlo
 *   node scripts/db/migrate.mjs --no-grants  no re-aplica 03_grants.sql al final
 *
 * Por que --baseline: scripts/db/setup.sh ya corre las migraciones al crear la
 * base, pero no deja registro en la tabla de control. Sobre una base recien
 * creada por setup.sh hay que correr --baseline UNA vez; si no, este runner las
 * volveria a aplicar.
 *
 * Por que no mandamos el archivo entero por client.query(): el protocolo simple
 * de node-postgres envuelve el .sql completo en una transaccion implicita y el
 * primer error tira abajo todo el archivo sin decir que sentencia fallo. Aca
 * partimos en sentencias (respetando dollar-quoting) y las mandamos una por una
 * dentro de un begin/commit explicito, asi el error apunta a la sentencia real.
 *
 * Conexion: mismas variables que la app (DB_HOST, DB_PORT, DB_NAME, DB_USER,
 * DB_PASSWORD, DB_SSL). Las migraciones son DDL, o sea que necesitan el rol
 * dueno del schema (countrify_admin), no el de runtime (countrify_app): se
 * puede pisar el usuario con DB_ADMIN_USER / DB_ADMIN_PASSWORD sin tocar el
 * resto del env.
 *
 * Ojo DB_SSL: igual que lib/db/postgres.ts, solo el valor literal 'disable'
 * apaga TLS. Contra un Postgres local sin TLS, cualquier otro valor (o la
 * variable ausente) falla con un error que parece de red.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_DIR = resolve(root, 'db/bootstrap/migrations')
const GRANTS_FILE = resolve(root, 'db/bootstrap/03_grants.sql')

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const flags = {
  dryRun: args.includes('--dry-run'),
  baseline: args.includes('--baseline'),
  noGrants: args.includes('--no-grants'),
  help: args.includes('--help') || args.includes('-h'),
}
const dirArg = args.find((a) => a.startsWith('--dir='))
const MIGRATIONS_DIR = dirArg ? resolve(process.cwd(), dirArg.slice('--dir='.length)) : DEFAULT_DIR

const unknown = args.filter(
  (a) => !['--dry-run', '--baseline', '--no-grants', '--help', '-h'].includes(a) && !a.startsWith('--dir='),
)

if (flags.help || unknown.length) {
  if (unknown.length) console.error(`argumento desconocido: ${unknown.join(' ')}\n`)
  console.log(`uso: node scripts/db/migrate.mjs [opciones]

  --dry-run     lista las migraciones pendientes y sale sin tocar la base
  --baseline    registra todas las migraciones como aplicadas SIN ejecutarlas
                (para una base recien creada por scripts/db/setup.sh)
  --no-grants   no re-aplica db/bootstrap/03_grants.sql despues de migrar
  --dir=RUTA    directorio de migraciones (default db/bootstrap/migrations)

variables: DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD DB_SSL
           DB_ADMIN_USER / DB_ADMIN_PASSWORD pisan al usuario (DDL = countrify_admin)`)
  process.exit(unknown.length ? 2 : 0)
}

if (flags.dryRun && flags.baseline) {
  console.error('error: --dry-run y --baseline son excluyentes')
  process.exit(2)
}

// ---------------------------------------------------------------------------
// Split en sentencias respetando dollar-quoting ($$ ... $$ y $tag$ ... $tag$),
// strings con comillas simples y comentarios de linea.
//
// Mismo enfoque que scripts/db/build-schema.mjs. Esta duplicado a proposito:
// ese script corre todo en el top level (escribe archivos al importarlo), asi
// que no se puede importar sin dispararlo.
// ---------------------------------------------------------------------------
function splitStatements(sql) {
  const out = []
  let buf = ''
  let i = 0
  let inSingle = false
  let inLineComment = false
  let dollarTag = null

  while (i < sql.length) {
    const ch = sql[i]
    const rest = sql.slice(i)

    if (inLineComment) {
      buf += ch
      if (ch === '\n') inLineComment = false
      i += 1
      continue
    }

    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        buf += dollarTag
        i += dollarTag.length
        dollarTag = null
        continue
      }
      buf += ch
      i += 1
      continue
    }

    if (inSingle) {
      buf += ch
      if (ch === "'") inSingle = false
      i += 1
      continue
    }

    if (rest.startsWith('--')) {
      inLineComment = true
      buf += ch
      i += 1
      continue
    }

    if (ch === "'") {
      inSingle = true
      buf += ch
      i += 1
      continue
    }

    const dollarMatch = /^\$[A-Za-z_]*\$/.exec(rest)
    if (dollarMatch) {
      dollarTag = dollarMatch[0]
      buf += dollarTag
      i += dollarTag.length
      continue
    }

    if (ch === ';') {
      out.push(buf + ';')
      buf = ''
      i += 1
      continue
    }

    buf += ch
    i += 1
  }

  if (buf.trim()) out.push(buf)
  return out
}

/** Sentencias con contenido real (descarta las que son solo comentarios). */
function executableStatements(sql) {
  return splitStatements(sql).filter((stmt) => {
    const code = stmt
      .split('\n')
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n')
      .trim()
    return code !== '' && code !== ';'
  })
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Primera linea util de una sentencia, para los mensajes de error. */
function preview(stmt) {
  const oneLine = stmt.replace(/\s+/g, ' ').trim()
  return oneLine.length > 160 ? `${oneLine.slice(0, 157)}...` : oneLine
}

// ---------------------------------------------------------------------------
// Conexion
// ---------------------------------------------------------------------------
function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`error: falta la variable ${name}`)
    process.exit(2)
  }
  return value
}

function clientConfig() {
  return {
    host: requireEnv('DB_HOST'),
    port: Number(process.env.DB_PORT ?? 5432),
    database: requireEnv('DB_NAME'),
    user: process.env.DB_ADMIN_USER || requireEnv('DB_USER'),
    password: process.env.DB_ADMIN_PASSWORD || requireEnv('DB_PASSWORD'),
    // Igual que lib/db/postgres.ts: solo 'disable' apaga TLS.
    ssl: process.env.DB_SSL === 'disable' ? false : { rejectUnauthorized: false },
    application_name: 'countrify-migrate',
  }
}

const CONTROL_TABLE = `
create table if not exists countrify.schema_migrations (
  name       text primary key,
  hash       text not null,
  applied_at timestamptz not null default now()
)
`

async function ensureControlTable(client) {
  const { rows } = await client.query(`select to_regnamespace('countrify') is not null as ok`)
  if (!rows[0]?.ok) {
    throw new Error(
      'el schema countrify no existe. Esta base no fue inicializada todavia: '
        + 'corre primero scripts/db/setup.sh <base>',
    )
  }
  await client.query(CONTROL_TABLE)
}

// ---------------------------------------------------------------------------
// Aplicacion de un archivo, en UNA transaccion.
// ---------------------------------------------------------------------------
async function applyFile(client, { name, sql, hash, record }) {
  const statements = executableStatements(sql)
  await client.query('begin')
  try {
    for (const [idx, stmt] of statements.entries()) {
      try {
        await client.query(stmt)
      } catch (err) {
        err.__stmt = { idx: idx + 1, total: statements.length, text: stmt }
        throw err
      }
    }
    if (record) {
      await client.query(
        `insert into countrify.schema_migrations (name, hash) values ($1, $2)
         on conflict (name) do update set hash = excluded.hash, applied_at = now()`,
        [name, hash],
      )
    }
    await client.query('commit')
  } catch (err) {
    try {
      await client.query('rollback')
    } catch {
      // si la conexion ya murio el rollback es redundante
    }
    throw err
  }
  return statements.length
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!existsSync(MIGRATIONS_DIR)) {
    console.error(`error: no existe el directorio de migraciones ${MIGRATIONS_DIR}`)
    console.error('       generalo con: node scripts/db/build-schema.mjs')
    process.exit(2)
  }

  const files = readdirSync(MIGRATIONS_DIR)
    // Los archivos con punto inicial NO son migraciones. El repo hermano
    // (Citify) tiene 7 archivos .oneshot-wipe-*.sql ahi adentro que son
    // borrados masivos de datos. Sin este filtro, el runner los aplica.
    .filter((f) => f.endsWith('.sql') && !f.startsWith('.'))
    .sort()

  if (!files.length) {
    console.log('no hay migraciones en', MIGRATIONS_DIR)
    return
  }

  const onDisk = files.map((name) => {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8')
    return { name, sql, hash: sha256(sql) }
  })

  const client = new Client(clientConfig())
  await client.connect()

  try {
    await ensureControlTable(client)

    const { rows } = await client.query(
      `select name, hash, applied_at from countrify.schema_migrations`,
    )
    const applied = new Map(rows.map((r) => [r.name, r]))

    // 1. Integridad: una migracion ya aplicada no puede cambiar de contenido.
    const drifted = onDisk.filter((m) => applied.has(m.name) && applied.get(m.name).hash !== m.hash)
    if (drifted.length) {
      console.error('ABORTA: migraciones ya aplicadas cambiaron de contenido.\n')
      for (const m of drifted) {
        const prev = applied.get(m.name)
        console.error(`  ${m.name}`)
        console.error(`    en la base : ${prev.hash}  (aplicada ${prev.applied_at.toISOString?.() ?? prev.applied_at})`)
        console.error(`    en el disco: ${m.hash}`)
      }
      console.error(`
Una migracion aplicada es historia: no se edita. Opciones:
  - si el cambio es real, escribi una migracion NUEVA con el arreglo;
  - si el archivo se regenero sin cambios de fondo (build-schema.mjs) y estas
    seguro de que la base ya tiene ese estado, actualiza el hash a mano:
      update countrify.schema_migrations set hash = '<hash del disco>' where name = '<archivo>';`)
      process.exitCode = 1
      return
    }

    // 2. Huerfanas: registradas en la base pero sin archivo. Solo avisa.
    const orphans = [...applied.keys()].filter((name) => !onDisk.some((m) => m.name === name))
    for (const name of orphans) {
      console.warn(`aviso: ${name} esta registrada en la base pero no existe en disco`)
    }

    const pending = onDisk.filter((m) => !applied.has(m.name))

    if (!pending.length) {
      console.log(`todo al dia: ${applied.size} migraciones aplicadas, 0 pendientes`)
      return
    }

    if (flags.dryRun) {
      console.log(`pendientes (${pending.length}):`)
      for (const m of pending) console.log(`  ${m.name}  ${m.hash.slice(0, 12)}`)
      console.log('\n--dry-run: no se aplico nada')
      return
    }

    if (flags.baseline) {
      for (const m of pending) {
        await client.query(
          `insert into countrify.schema_migrations (name, hash) values ($1, $2)
           on conflict (name) do nothing`,
          [m.name, m.hash],
        )
        console.log(`  baseline  ${m.name}`)
      }
      console.log(`\n${pending.length} migraciones marcadas como aplicadas (no se ejecuto SQL)`)
      return
    }

    console.log(`aplicando ${pending.length} migracion(es) sobre ${clientConfig().database}\n`)
    for (const m of pending) {
      process.stdout.write(`  ${m.name} ... `)
      const count = await applyFile(client, { ...m, record: true })
      console.log(`ok (${count} sentencias)`)
    }

    // 3. Grants. Las tablas nuevas nacen del rol que corre la migracion; si los
    //    default privileges se registraron para otro rol, countrify_app se
    //    queda sin permisos y la app rompe recien en runtime. Re-aplicar
    //    03_grants.sql es idempotente y barato.
    if (!flags.noGrants && existsSync(GRANTS_FILE)) {
      process.stdout.write(`  ${basename(GRANTS_FILE)} ... `)
      const count = await applyFile(client, {
        name: basename(GRANTS_FILE),
        sql: readFileSync(GRANTS_FILE, 'utf8'),
        hash: '',
        record: false,
      })
      console.log(`ok (${count} sentencias)`)
    }

    console.log(`\nlisto: ${pending.length} migracion(es) aplicada(s)`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.log('')
  console.error('FALLO la migracion.')
  if (err.__stmt) {
    const { idx, total, text } = err.__stmt
    console.error(`  sentencia ${idx}/${total}: ${preview(text)}`)
  }
  console.error(`  ${err.message}`)
  if (err.detail) console.error(`  detail: ${err.detail}`)
  if (err.hint) console.error(`  hint: ${err.hint}`)
  if (err.__stmt) {
    console.error('\nLa transaccion se revirtio: la base quedo como estaba antes de este archivo.')
  }
  process.exit(1)
})
