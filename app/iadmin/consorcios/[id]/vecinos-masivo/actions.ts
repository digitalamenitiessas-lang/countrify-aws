'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { findProfileByEmail } from '@/lib/db/profiles'
import { listUnitsBasicByPropertyFromPostgres } from '@/lib/db/iadmin-reads'
import {
  getBuildingIdForPropertyFromPostgres,
  getUnitFullScopeFromPostgres,
} from '@/lib/db/iadmin-writes'
import { ensureUnitUserWithCredentials } from '@/lib/iadmin/unit-users'
import { sendWelcomeEmail } from '@/lib/email/notifications/welcome'
import {
  normalizeText,
  parseRelationship,
  type ConfirmRowInput,
  type PreviewResult,
  type PreviewRow,
} from '@/lib/iadmin/paste-table'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const previewRowSchema = z.object({
  unitCode: z.string().max(60),
  fullName: z.string().max(160),
  email: z.string().max(200),
  phone: z.string().max(60),
  relationshipRaw: z.string().max(60),
})

const previewSchema = z.object({
  administrationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  rows: z.array(previewRowSchema).max(500),
})

// Dry-run: valida filas estructuradas sin escribir nada ni generar contraseñas.
// El parseo del texto pegado lo hace el cliente (parsePastedTable es seguro en
// browser), así la tabla editable queda alineada 1:1 con lo que se valida.
export async function previewBulkUnitUsers(
  input: z.input<typeof previewSchema>,
): Promise<PreviewResult> {
  const parsed = previewSchema.parse(input)

  await requireIAdmin({
    capability: 'holders.manage',
    administrationId: parsed.administrationId,
  })

  const buildingId = await getBuildingIdForPropertyFromPostgres(parsed.propertyId)
  if (!buildingId) throw new Error('No se encontró el edificio del consorcio')

  const units = await listUnitsBasicByPropertyFromPostgres(parsed.propertyId)
  const unitByCode = new Map<string, { id: string; code: string }>()
  for (const unit of units) {
    if (unit.is_active === false) continue
    unitByCode.set(normalizeText(unit.code), { id: unit.id, code: unit.code })
  }

  // Para detectar duplicados dentro del mismo lote (unidad+email+relación).
  const seen = new Set<string>()
  const rows: PreviewRow[] = []

  for (const [index, raw] of parsed.rows.entries()) {
    const row = {
      sourceLine: index + 1,
      unitCode: raw.unitCode.trim(),
      fullName: raw.fullName.trim(),
      email: raw.email.trim(),
      phone: raw.phone.trim(),
      relationshipRaw: raw.relationshipRaw.trim(),
      relationshipType: parseRelationship(raw.relationshipRaw),
    }

    const base: PreviewRow = {
      sourceLine: row.sourceLine,
      unitCode: row.unitCode,
      unitId: null,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      relationshipRaw: row.relationshipRaw,
      relationshipType: row.relationshipType,
      status: 'error',
      errorCode: null,
      message: null,
    }

    const email = row.email.trim().toLowerCase()

    if (!row.unitCode.trim()) {
      rows.push({ ...base, errorCode: 'missing_unit', message: 'Falta la unidad' })
      continue
    }
    if (row.fullName.trim().length < 2) {
      rows.push({ ...base, errorCode: 'missing_name', message: 'Falta el nombre' })
      continue
    }
    if (!email) {
      rows.push({ ...base, errorCode: 'missing_email', message: 'Falta el email' })
      continue
    }
    if (!EMAIL_REGEX.test(email)) {
      rows.push({ ...base, errorCode: 'invalid_email', message: 'Email inválido' })
      continue
    }
    if (!row.relationshipType) {
      rows.push({
        ...base,
        errorCode: 'invalid_relationship',
        message: `Relación no reconocida: "${row.relationshipRaw}"`,
      })
      continue
    }

    const unit = unitByCode.get(normalizeText(row.unitCode))
    if (!unit) {
      rows.push({ ...base, errorCode: 'unknown_unit', message: `Unidad inexistente: "${row.unitCode}"` })
      continue
    }

    const dedupeKey = `${unit.id}|${email}|${row.relationshipType}`
    if (seen.has(dedupeKey)) {
      rows.push({
        ...base,
        unitId: unit.id,
        email,
        status: 'duplicate_row',
        message: 'Fila duplicada en el pegado (se saltea)',
      })
      continue
    }
    seen.add(dedupeKey)

    const existing = await findProfileByEmail(email)
    if (existing && existing.buildingId && existing.buildingId !== buildingId) {
      rows.push({
        ...base,
        unitId: unit.id,
        email,
        errorCode: 'email_other_building',
        message: 'El email ya pertenece a otro consorcio',
      })
      continue
    }

    const reuse = Boolean(existing)
    rows.push({
      ...base,
      unitId: unit.id,
      email,
      status: reuse ? 'reuse_existing' : 'will_create',
      message: reuse ? 'Ya existe: sólo se vincula' : 'Nuevo: se crea y se envían credenciales',
    })
  }

  const summary = {
    total: rows.length,
    valid: rows.filter((r) => r.status === 'will_create' || r.status === 'reuse_existing').length,
    errors: rows.filter((r) => r.status === 'error').length,
    willCreate: rows.filter((r) => r.status === 'will_create').length,
    reuseExisting: rows.filter((r) => r.status === 'reuse_existing').length,
    duplicates: rows.filter((r) => r.status === 'duplicate_row').length,
  }

  return { rows, summary }
}

const confirmRowSchema = z.object({
  sourceLine: z.number().int(),
  unitId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(40).nullable(),
  relationshipType: z.enum(['vecino_principal', 'vecino_adicional']),
})

const confirmSchema = z.object({
  administrationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  rows: z.array(confirmRowSchema).min(1).max(500),
  // Vínculo legal a usar SÓLO para contactos nuevos (sin holder previo con ese
  // email). No se asume: el wizard lo pide. Si ya existe el contacto, se respeta
  // su vínculo y este valor se ignora.
  defaultHolderKind: z.enum(['propietario', 'inquilino', 'apoderado', 'otro']).default('otro'),
})

export interface ConfirmBulkResult {
  created: number
  reused: number
  errors: Array<{ sourceLine: number; email: string; message: string }>
}

// Commit: por fila crea/vincula al vecino. Un error en una fila no aborta el
// lote. Tras el loop manda los mails de bienvenida (con throttle).
export async function confirmBulkUnitUsers(
  input: z.input<typeof confirmSchema>,
): Promise<ConfirmBulkResult> {
  const parsed = confirmSchema.parse(input)

  const { profile } = await requireIAdmin({
    capability: 'holders.manage',
    administrationId: parsed.administrationId,
  })

  let created = 0
  let reused = 0
  const errors: ConfirmBulkResult['errors'] = []
  const welcomeBatch: Array<{ profileId: string; password: string }> = []

  for (const row of parsed.rows as ConfirmRowInput[]) {
    try {
      const scope = await getUnitFullScopeFromPostgres(row.unitId)
      if (!scope) throw new Error('Unidad no encontrada')
      // Anti-tampering: la unidad debe pertenecer a este consorcio/propiedad.
      if (
        scope.administrationId !== parsed.administrationId ||
        scope.managedPropertyId !== parsed.propertyId
      ) {
        throw new Error('La unidad no pertenece a este consorcio')
      }

      const result = await ensureUnitUserWithCredentials({
        scope: {
          unitId: scope.unitId,
          unitCode: scope.unitCode,
          buildingId: scope.buildingId,
          administrationId: scope.administrationId,
        },
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        relationshipType: row.relationshipType,
        actorProfileId: profile.id,
        via: 'bulk',
        holderKind: parsed.defaultHolderKind,
      })

      if (result.created) {
        created++
        if (result.temporaryPassword) {
          welcomeBatch.push({ profileId: result.profileId, password: result.temporaryPassword })
        }
      } else {
        reused++
      }
    } catch (err) {
      errors.push({
        sourceLine: row.sourceLine,
        email: row.email,
        message: err instanceof Error ? err.message : 'Error desconocido',
      })
    }
  }

  // Mails de bienvenida en background, con throttle (idempotente por reason).
  void dispatchWelcomeBatch(welcomeBatch)

  revalidatePath(`/iadmin/consorcios/${parsed.propertyId}`)
  return { created, reused, errors }
}

// Copia local del throttler de superadmin: 1.1s entre mails. sendWelcomeEmail
// resuelve email/nombre/edificio desde el profileId, así que sólo pasamos id +
// contraseña temporal. Es best-effort (nunca tira) e idempotente por reason.
async function dispatchWelcomeBatch(
  batch: Array<{ profileId: string; password: string }>,
): Promise<void> {
  for (const item of batch) {
    await sendWelcomeEmail({
      profileId: item.profileId,
      temporaryPassword: item.password,
      reason: 'bulk_imported',
    })
    await new Promise((resolve) => setTimeout(resolve, 1100))
  }
}
