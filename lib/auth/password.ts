// Hashing y politica de contraseñas. Reemplaza lo que antes resolvia el user
// pool de Cognito (hashing, policy de complejidad y generacion de temporales).
//
// Se usa @node-rs/argon2 y no 'argon2' ni 'bcrypt': trae binarios precompilados
// para linux-musl, que es lo que necesita la imagen node:22-alpine del
// Dockerfile. Los otros dos exigen toolchain de compilacion adentro de la
// imagen.

import { randomInt } from 'node:crypto'
import { hash, verify, type Algorithm, type Options } from '@node-rs/argon2'

// @node-rs/argon2 declara Algorithm como `const enum`, y con isolatedModules el
// valor no llega en runtime (el modulo exporta un objeto vacio). Pasamos el
// literal que espera la lib: 2 = argon2id.
const ARGON2ID = 2 as Algorithm

// Parametros explicitos, NO los defaults de la libreria. 19456 KiB (19 MiB) es
// el minimo que recomienda OWASP para argon2id con t=2/p=1, y el VPS comparte
// RAM con otros procesos, asi que no conviene el default de ~64 MiB por hash.
const HASH_OPTIONS: Options = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

// Hash fijo, generado con los mismos parametros, contra el que se verifica
// cuando el email no existe. Sirve para que el login tarde lo mismo exista o no
// la cuenta y no se pueda enumerar usuarios midiendo el tiempo de respuesta.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$wI7+VahQxMpj83KGWr6PnQ$nZAbkJdrEwxa9CKBs0erZTRmpZWiU+GrdjRMX2DxyX4'

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, HASH_OPTIONS)
}

// Los parametros viajan dentro del propio hash (formato PHC), asi que verify no
// necesita opciones: un hash viejo con otros parametros igual valida.
export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain)
  } catch {
    // Un hash corrupto o en un formato desconocido es un login fallido, no un
    // 500.
    return false
  }
}

// Quema el mismo tiempo que un verify real. Se llama cuando no hay cuenta (o
// no tiene password_hash) para no delatar la diferencia.
export async function verifyDummyPassword(plain: string): Promise<void> {
  await verifyPassword(DUMMY_HASH, plain)
}

// Politica minima server-side. Antes la imponia el pool de Cognito; al sacarlo
// se perdio y hay que validarla en la app.
//
// 6 caracteres, sin exigir combinacion de tipos. Es una decision explicita del
// dueño (2026-09-22), tomada sabiendo que es floja.
//
// Lo que sostiene la seguridad mientras tanto:
//   - lib/rate-limit.ts limita a 10 intentos por minuto por IP y 10 cada 15
//     minutos por cuenta, que es la defensa real contra alguien probando
//     contraseñas. Sin eso, 6 caracteres se rompen en minutos.
//   - Los hashes son argon2id (19 MiB, t=2), asi que incluso con la base
//     filtrada romperlos offline es caro.
//
// Sobre no exigir "3 de 4 tipos": las guias actuales (NIST SP 800-63B) la
// desaconsejan. Empuja a la gente a "Password1!", que es predecible, y la
// longitud aporta mucho mas que la variedad. Si se sube el minimo alguna vez,
// subir la longitud antes que agregar reglas de composicion.
//
// SUBIR ESTO antes de abrir el registro al publico o de que entren consorcios
// reales con datos de cobranza.
const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 72

export function validatePasswordPolicy(pwd: unknown): string | null {
  if (typeof pwd !== 'string') return 'Contraseña inválida.'
  if (pwd.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
  }
  if (pwd.length > PASSWORD_MAX_LENGTH) return 'La contraseña es demasiado larga.'
  return null
}

// Genera una contraseña temporal de 14 chars con al menos 1 de cada clase
// (mayúscula, minúscula, dígito, símbolo). Queda holgada sobre el minimo de
// validatePasswordPolicy. Usa crypto.randomInt (CSPRNG) y luego baraja para no
// fijar las posiciones.
export function generateTempPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%*?-_'
  const all = upper + lower + digits + symbols

  const pick = (set: string) => set[randomInt(set.length)]
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  while (chars.length < length) {
    chars.push(pick(all))
  }

  // Fisher-Yates con randomInt para no dejar las 4 clases fijas al inicio.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}
