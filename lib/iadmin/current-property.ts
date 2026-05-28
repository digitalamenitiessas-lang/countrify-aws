import { cookies } from 'next/headers'

export const CURRENT_PROPERTY_COOKIE = 'currentPropertyId'

/**
 * Lee la cookie del consorcio activo (currentPropertyId).
 * El valor `null` o el string literal "all" significan "todos los edificios".
 * Validamos contra una lista de IDs permitidos para evitar leakage entre administraciones.
 */
export async function getCurrentPropertyId(allowedPropertyIds: string[]): Promise<string | null> {
  if (allowedPropertyIds.length === 0) return null
  const store = await cookies()
  const raw = store.get(CURRENT_PROPERTY_COOKIE)?.value ?? null
  if (!raw || raw === 'all') return null
  return allowedPropertyIds.includes(raw) ? raw : null
}
