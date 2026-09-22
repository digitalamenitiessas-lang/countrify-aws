#!/usr/bin/env node
/**
 * Crea (o re-credencializa) el primer super_admin sobre una base recien creada
 * con scripts/db/setup.sh. Sin esto no hay forma de entrar: la app ya no tiene
 * el user pool de Cognito donde se daba de alta el primer usuario a mano.
 *
 * Uso:
 *
 *   SEED_SUPERADMIN_EMAIL=admin@countrify.com.ar \
 *   SEED_SUPERADMIN_PASSWORD='...' \
 *   node --env-file=.env.local scripts/db/seed-superadmin.mjs
 *
 * Las credenciales se leen SOLO de variables de entorno, nunca de argumentos:
 * los argumentos quedan en el historial del shell y en la lista de procesos.
 *
 * Variables:
 *   SEED_SUPERADMIN_EMAIL     (requerida)
 *   SEED_SUPERADMIN_PASSWORD  (requerida)
 *   SEED_SUPERADMIN_NAME      (opcional, default 'Super Admin')
 *   DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD DB_SSL  conexion, igual que la app
 *
 * Es idempotente: si el email ya existe le reescribe el hash y lo deja como
 * super_admin, en vez de fallar.
 */

import { randomUUID } from 'node:crypto'
import { hash } from '@node-rs/argon2'
import pg from 'pg'

// Fuente unica de la politica, compartida con la app. No duplicar aca: cuando
// estaba duplicada, el script quedo pidiendo 10 caracteres despues de que la
// app bajo a 6, y rechazaba contraseñas validas con un mensaje que no
// correspondia a ninguna regla vigente.
import { validatePasswordPolicy } from '../../lib/auth/password-policy.mjs'

// Los mismos parametros que lib/auth/password.ts. Si cambian alla, cambian aca:
// un hash generado con otros parametros igual valida (viajan dentro del propio
// hash), pero conviene que el seed no quede fuera de politica.
const ARGON2ID = 2
const HASH_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`error: falta la variable de entorno ${name}`)
    process.exit(1)
  }
  return value
}

async function main() {
  const email = requiredEnv('SEED_SUPERADMIN_EMAIL').toLowerCase()
  const password = requiredEnv('SEED_SUPERADMIN_PASSWORD')
  const fullName = process.env.SEED_SUPERADMIN_NAME?.trim() || 'Super Admin'

  const passwordError = validatePasswordPolicy(password)
  if (passwordError) {
    console.error(`error: ${passwordError}`)
    process.exit(1)
  }

  const client = new pg.Client({
    host: requiredEnv('DB_HOST'),
    port: Number(process.env.DB_PORT ?? 5432),
    database: requiredEnv('DB_NAME'),
    user: requiredEnv('DB_USER'),
    password: requiredEnv('DB_PASSWORD'),
    ssl: process.env.DB_SSL === 'disable' ? false : { rejectUnauthorized: false },
  })

  await client.connect()

  try {
    const passwordHash = await hash(password, HASH_OPTIONS)
    const avatarText =
      fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('') || 'SA'

    const existing = await client.query(
      `select id from countrify.profiles where lower(email) = lower($1) limit 1`,
      [email],
    )

    if (existing.rows[0]) {
      await client.query(
        `update countrify.profiles
            set password_hash = $2,
                password_must_change = false,
                role = 'super_admin'
          where id = $1`,
        [existing.rows[0].id, passwordHash],
      )
      console.log(`listo: ${email} ya existia — hash actualizado (id ${existing.rows[0].id})`)
      return
    }

    const id = randomUUID()
    await client.query(
      `insert into countrify.profiles
         (id, email, full_name, avatar_text, role, password_hash, password_must_change)
       values ($1, lower($2), $3, $4, 'super_admin', $5, false)`,
      [id, email, fullName, avatarText, passwordHash],
    )
    console.log(`listo: super_admin ${email} creado (id ${id})`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('error:', error instanceof Error ? error.message : error)
  process.exit(1)
})
