import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg'

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
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 10_000),
  }
}

export function getPostgresPool() {
  if (!global.__citifyPgPool) {
    global.__citifyPgPool = new Pool(getPoolConfig())
  }

  return global.__citifyPgPool
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
  return getPostgresPool().query<T>(text, values)
}
