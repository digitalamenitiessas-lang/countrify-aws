import { cookies } from 'next/headers'

export const CURRENT_PROPERTY_COOKIE = 'currentPropertyId'

/**
 * Lee la cookie del consorcio activo (currentPropertyId) y devuelve el ID
 * por el cual filtrar las páginas cross-cartera.
 *
 * Reglas:
 * - Si el admin solo gestiona un edificio, ese es el active por default
 *   (no tiene sentido la vista "todos" cuando hay uno solo).
 * - Valor literal "all" en cookie → null (= sin filtro, vista consolidada).
 * - Valor con UUID → si pertenece a allowedPropertyIds, ese; si no, null.
 * - Sin cookie → si hay un solo edificio ese, si no null.
 */
export async function getCurrentPropertyId(allowedPropertyIds: string[]): Promise<string | null> {
  if (allowedPropertyIds.length === 0) return null

  const store = await cookies()
  const raw = store.get(CURRENT_PROPERTY_COOKIE)?.value ?? null

  // "all" explícito → vista consolidada. Pero si solo hay 1 edificio, ignoramos
  // el "all" y filtramos a ese (no hay vista consolidada útil con un solo edificio).
  if (raw === 'all') {
    return allowedPropertyIds.length === 1 ? allowedPropertyIds[0] : null
  }

  if (raw && allowedPropertyIds.includes(raw)) return raw

  // Sin cookie o cookie inválida: si solo hay un edificio, ese es el default.
  if (allowedPropertyIds.length === 1) return allowedPropertyIds[0]

  return null
}
