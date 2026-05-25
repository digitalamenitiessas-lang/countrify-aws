// Rate limiter in-memory de fixed-window por clave (tipicamente IP+ruta o
// email+ruta). Funciona en single-task; si pasamos a multi-task hay que
// mover a Redis/Memcached. Sweep opportunistico cuando el Map crece para
// evitar bloat.

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 5_000

function sweepExpired() {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key)
  }
}

export interface RateLimitOptions {
  max: number
  windowSeconds: number
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
}

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  if (buckets.size > MAX_BUCKETS) sweepExpired()

  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowSeconds * 1000 })
    return { ok: true, remaining: opts.max - 1, retryAfterSeconds: 0 }
  }

  if (existing.count >= opts.max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  return {
    ok: true,
    remaining: opts.max - existing.count,
    retryAfterSeconds: 0,
  }
}

// Extrae la IP del cliente respetando el ALB / proxies. CloudFront y ALB
// agregan X-Forwarded-For; tomamos el primero (cliente original).
export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  const real = headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

// Helper canonico: aplica limits comunes y devuelve la response 429 lista
// si excede. El caller hace `if (limited) return limited` al principio del
// handler.
export function rateLimitResponse(
  key: string,
  opts: RateLimitOptions,
): Response | null {
  const result = checkRateLimit(key, opts)
  if (result.ok) return null
  return new Response(
    JSON.stringify({
      error: `Demasiados intentos. Esperá ${result.retryAfterSeconds} segundos.`,
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(result.retryAfterSeconds),
      },
    },
  )
}
