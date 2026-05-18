import { Pool, types, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg'

// Keep date/time columns as ISO strings instead of JS Date objects so they can
// be passed straight into React/JSON without "Objects are not valid as a React
// child" runtime errors. Matches the historical Supabase REST behavior.
const TIMESTAMPTZ_OID = 1184
const TIMESTAMP_OID = 1114
const DATE_OID = 1082
types.setTypeParser(TIMESTAMPTZ_OID, (val: any) => val)
types.setTypeParser(TIMESTAMP_OID, (val: any) => val)
types.setTypeParser(DATE_OID, (val: any) => val)

declare global {
  // eslint-disable-next-line no-var
  var __citifyPgPool: Pool | undefined
}

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} no esta configurada.`)
  }
  return value
}

export function isPostgresConfigured() {
  return Boolean(
    process.env.DB_HOST
      && process.env.DB_PORT
      && process.env.DB_NAME
      && process.env.DB_USER
      && process.env.DB_PASSWORD,
  )
}

function getPoolConfig(): PoolConfig {
  return {
    host: getRequiredEnv('DB_HOST'),
    port: Number(getRequiredEnv('DB_PORT')),
    database: getRequiredEnv('DB_NAME'),
    user: getRequiredEnv('DB_USER'),
    password: getRequiredEnv('DB_PASSWORD'),
    ssl: process.env.DB_SSL === 'disable' ? false : { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 30_000),
  }
}

export function getPostgresPool() {
  if (!global.__citifyPgPool) {
    const pool = new Pool(getPoolConfig())
    // Sin este handler, una conexión idle que el server cierra (RDS, pgbouncer,
    // firewall) tira un 'error' no manejado y mata el proceso de Node.
    pool.on('error', (err) => {
      console.error('[pg pool] idle client error:', err.message)
    })
    global.__citifyPgPool = pool
  }

  return global.__citifyPgPool
}

function isTransientConnectionError(err: unknown) {
  const msg = err instanceof Error ? err.message.toLowerCase() : ''
  return (
    msg.includes('connection terminated')
    || msg.includes('connection ended')
    || msg.includes('econnreset')
    || msg.includes('socket hang up')
  )
}

export async function withPgClient<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPostgresPool().connect()
  try {
    return await callback(client)
  } finally {
    client.release()
  }
}

export async function pgQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  try {
    return await getPostgresPool().query<T>(text, values)
  } catch (err) {
    // Solo reintentamos cuando una conexión idle del pool fue cerrada por el server.
    // Para timeouts de conexión inicial no tiene sentido reintentar inmediato.
    if (isTransientConnectionError(err) && !String((err as Error).message).toLowerCase().includes('connection timeout')) {
      console.warn('[pg] conexión cerrada, reintentando una vez:', (err as Error).message)
      return await getPostgresPool().query<T>(text, values)
    }
    throw err
  }
}

// Ejecuta una serie de queries dentro de una transacción con
// `app.current_profile_id` seteado, de modo que cualquier RPC que use
// `auth.uid()` (que en RDS leemos desde esa variable de sesión) tenga acceso
// al profile id del usuario autenticado por Cognito.
export async function pgQueryAsProfile<T extends QueryResultRow = QueryResultRow>(
  profileId: string,
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  if (!/^[0-9a-fA-F-]{36}$/.test(profileId)) {
    throw new Error('profileId con formato invalido')
  }
  return withPgClient(async (client) => {
    await client.query('begin')
    try {
      await client.query(`set local app.current_profile_id = '${profileId}'`)
      const result = await client.query<T>(text, values)
      await client.query('commit')
      return result
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  })
}
