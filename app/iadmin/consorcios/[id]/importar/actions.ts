'use server'

import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { runAIChat, stripJsonFences } from '@/lib/iadmin/ai-chat'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  closeActiveHoldersOfKindInPostgres,
  insertUnitHolderInPostgres,
  listUnitsByPropertyMinimalFromPostgres,
  upsertUnitInPostgres,
} from '@/lib/db/iadmin-writes'

const targetFields = [
  'unit_code',
  'unit_kind',
  'floor',
  'surface_m2',
  'prorata_percent',
  'holder_name',
  'holder_kind',
  'holder_tax_id',
  'holder_email',
  'holder_phone',
  'ignore',
] as const

export type ImportTargetField = (typeof targetFields)[number]

const TARGET_LABELS: Record<ImportTargetField, string> = {
  unit_code: 'Código de unidad',
  unit_kind: 'Tipo de unidad',
  floor: 'Piso',
  surface_m2: 'Superficie (m²)',
  prorata_percent: 'Alícuota (%)',
  holder_name: 'Nombre titular',
  holder_kind: 'Tipo titular (propietario/inquilino)',
  holder_tax_id: 'CUIT / DNI',
  holder_email: 'Email titular',
  holder_phone: 'Teléfono titular',
  ignore: 'Ignorar columna',
}

const analyzeSchema = z.object({
  administrationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  headers: z.array(z.string()).min(1),
  sampleRows: z.array(z.record(z.unknown())).min(1).max(8),
})

export type AnalyzeColumnsResult = {
  mapping: Record<string, ImportTargetField>
  labels: Record<ImportTargetField, string>
}

const SYSTEM_PROMPT = `Sos un asistente que mapea columnas de Excel/CSV a campos de un sistema de consorcios.

El sistema necesita estos campos posibles:
- unit_code: codigo de la unidad (ej "1A", "PH", "Lote 23")
- unit_kind: tipo (departamento, casa, local, cochera, baulera, otro)
- floor: piso (ej "1", "PB", "PH")
- surface_m2: superficie en m2
- prorata_percent: alicuota en %. Aceptá tanto decimal (0.125) como porcentaje (12.5).
- holder_name: nombre completo del titular/propietario/inquilino
- holder_kind: tipo de relacion (propietario, inquilino, apoderado, otro)
- holder_tax_id: CUIT o DNI del titular
- holder_email: email del titular
- holder_phone: telefono del titular
- ignore: columna que no matchea con ninguno de los anteriores

Recibis los headers y muestras de filas del Excel del admin. Tu trabajo es devolver un JSON EXACTO que mapee cada header original al campo target correspondiente:

{
  "<nombre_original_header_1>": "unit_code",
  "<nombre_original_header_2>": "prorata_percent",
  ...
}

Reglas:
- Usá las muestras para decidir.
- Si una columna tiene "1A", "2B", "PH" es unit_code.
- Si una columna tiene numeros entre 0 y 1 tipo 0.125, 0.15 es prorata_percent (decimal).
- Si una columna tiene numeros tipo 12.5, 20.00, 100 es prorata_percent (porcentaje).
- Si una columna tiene nombres tipo "Departamento", "Casa" es unit_kind.
- Si no matchea con ninguno, devolver "ignore".
- Devolvé SOLO el JSON, sin texto adicional.`

export async function analyzeImportColumns(
  input: z.input<typeof analyzeSchema>,
): Promise<AnalyzeColumnsResult> {
  const parsed = analyzeSchema.parse(input)
  await requireIAdmin({
    capability: 'units.manage',
    administrationId: parsed.administrationId,
  })

  const userPrompt = `Headers:\n${JSON.stringify(parsed.headers)}\n\nMuestras de filas:\n${JSON.stringify(parsed.sampleRows, null, 2)}\n\nDevolvé el JSON de mapeo.`

  const raw = await runAIChat({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    jsonMode: true,
    temperature: 0,
    maxTokens: 800,
  })

  const cleaned = stripJsonFences(raw)
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(cleaned)
  } catch {
    throw new Error('La IA devolvio un formato invalido')
  }

  const mapping: Record<string, ImportTargetField> = {}
  if (typeof parsedJson === 'object' && parsedJson !== null) {
    for (const [k, v] of Object.entries(parsedJson as Record<string, unknown>)) {
      if (typeof v === 'string' && (targetFields as readonly string[]).includes(v)) {
        mapping[k] = v as ImportTargetField
      } else {
        mapping[k] = 'ignore'
      }
    }
  }

  for (const h of parsed.headers) {
    if (!(h in mapping)) mapping[h] = 'ignore'
  }

  return { mapping, labels: TARGET_LABELS }
}

const unitKindMap: Record<string, string> = {
  depto: 'departamento',
  departamento: 'departamento',
  casa: 'casa',
  local: 'local',
  cochera: 'cochera',
  coch: 'cochera',
  baulera: 'baulera',
  otro: 'otro',
}

const holderKindMap: Record<string, string> = {
  propietario: 'propietario',
  dueno: 'propietario',
  dueño: 'propietario',
  owner: 'propietario',
  inquilino: 'inquilino',
  locatario: 'inquilino',
  tenant: 'inquilino',
  apoderado: 'apoderado',
  otro: 'otro',
}

function normalizeUnitKind(raw: unknown): string {
  const s = String(raw ?? '').toLowerCase().trim()
  if (!s) return 'departamento'
  for (const [k, v] of Object.entries(unitKindMap)) {
    if (s.includes(k)) return v
  }
  return 'otro'
}

function normalizeHolderKind(raw: unknown): string {
  const s = String(raw ?? '').toLowerCase().trim()
  if (!s) return 'propietario'
  for (const [k, v] of Object.entries(holderKindMap)) {
    if (s.includes(k)) return v
  }
  return 'propietario'
}

function normalizeProrata(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const s = String(raw).replace('%', '').replace(',', '.').trim()
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  if (n < 0) return null
  if (n > 1.5) return n / 100
  return n
}

function normalizeNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(String(raw).replace(',', '.').trim())
  return Number.isFinite(n) ? n : null
}

const rowSchema = z.record(z.unknown())
const importSchema = z.object({
  administrationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  mapping: z.record(z.string()),
  rows: z.array(rowSchema).min(1).max(500),
  replaceActiveHolders: z.boolean().optional().default(true),
})

export type ImportResult = {
  unitsCreated: number
  unitsUpdated: number
  holdersCreated: number
  holdersSkipped: number
  skippedRows: Array<{ index: number; reason: string }>
}

export async function importUnitsAndHolders(
  input: z.input<typeof importSchema>,
): Promise<ImportResult> {
  const parsed = importSchema.parse(input)
  const { profile } = await requireIAdmin({
    capability: 'units.manage',
    administrationId: parsed.administrationId,
  })

  const targetToSource: Record<string, string> = {}
  for (const [source, target] of Object.entries(parsed.mapping)) {
    targetToSource[target] = source
  }

  const readField = (row: Record<string, unknown>, target: ImportTargetField) => {
    const source = targetToSource[target]
    if (!source) return undefined
    return row[source]
  }

  const result: ImportResult = {
    unitsCreated: 0,
    unitsUpdated: 0,
    holdersCreated: 0,
    holdersSkipped: 0,
    skippedRows: [],
  }

  const existingUnitsRaw = await listUnitsByPropertyMinimalFromPostgres(parsed.propertyId)
  const existingUnits = new Map<string, string>(
    existingUnitsRaw.map((u) => [String(u.code).trim(), u.id]),
  )

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i] as Record<string, unknown>

    const rawCode = readField(row, 'unit_code')
    const code = rawCode ? String(rawCode).trim() : ''
    if (!code) {
      result.skippedRows.push({ index: i, reason: 'Sin unit_code' })
      continue
    }

    const kind = normalizeUnitKind(readField(row, 'unit_kind'))
    const floorRaw = readField(row, 'floor')
    const floor = floorRaw !== undefined ? String(floorRaw).trim() : null
    const surface = normalizeNumber(readField(row, 'surface_m2'))
    const prorata = normalizeProrata(readField(row, 'prorata_percent'))

    let unitId = existingUnits.get(code)
    const wasUpdate = Boolean(unitId)

    try {
      const upserted = await upsertUnitInPostgres({
        id: unitId ?? null,
        managedPropertyId: parsed.propertyId,
        code,
        kind,
        floor,
        surfaceM2: surface,
        prorataCoefficient: prorata,
      })
      unitId = upserted.id
      if (!wasUpdate) {
        existingUnits.set(code, unitId)
        result.unitsCreated += 1
      } else {
        result.unitsUpdated += 1
      }
    } catch (error) {
      result.skippedRows.push({
        index: i,
        reason: `${wasUpdate ? 'Update' : 'Insert'} unit error: ${error instanceof Error ? error.message : 'unknown'}`,
      })
      continue
    }

    const rawHolderName = readField(row, 'holder_name')
    const holderName = rawHolderName ? String(rawHolderName).trim() : ''
    if (!holderName) continue

    const holderKind = normalizeHolderKind(readField(row, 'holder_kind'))
    const holderTaxId = readField(row, 'holder_tax_id')
    const holderEmail = readField(row, 'holder_email')
    const holderPhone = readField(row, 'holder_phone')

    if (parsed.replaceActiveHolders) {
      await closeActiveHoldersOfKindInPostgres({ unitId, holderKind })
    }

    try {
      await insertUnitHolderInPostgres({
        unitId,
        fullName: holderName,
        holderKind,
        taxId: holderTaxId ? String(holderTaxId).trim() : null,
        email: holderEmail ? String(holderEmail).trim() : null,
        phone: holderPhone ? String(holderPhone).trim() : null,
      })
      result.holdersCreated += 1
    } catch {
      result.holdersSkipped += 1
    }
  }

  await insertIAdminAuditLogInPostgres({
    administrationId: parsed.administrationId,
    actorProfileId: profile.id,
    entityType: 'iadmin_managed_properties',
    entityId: parsed.propertyId,
    action: 'bulk_import.units',
    metadata: {
      units_created: result.unitsCreated,
      units_updated: result.unitsUpdated,
      holders_created: result.holdersCreated,
      holders_skipped: result.holdersSkipped,
      skipped_rows: result.skippedRows.length,
    },
  })

  return result
}
