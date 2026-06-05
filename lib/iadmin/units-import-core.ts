import { runAIChat, stripJsonFences } from '@/lib/iadmin/ai-chat'
import {
  closeActiveHoldersOfKindInPostgres,
  insertUnitHolderInPostgres,
  listUnitsByPropertyMinimalFromPostgres,
  upsertUnitInPostgres,
} from '@/lib/db/iadmin-writes'

// ----------------------------------------------------------------------------
// Motor compartido de importación de unidades + titulares (con alícuotas).
// Lógica pura: NO autoriza ni audita. Cada action (IAdmin / superadmin) envuelve
// estas funciones con su propia autorización y su propio audit log.
// ----------------------------------------------------------------------------

export const unitsImportTargetFields = [
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

export type ImportTargetField = (typeof unitsImportTargetFields)[number]

export const UNITS_IMPORT_TARGET_LABELS: Record<ImportTargetField, string> = {
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

export type AnalyzeColumnsResult = {
  mapping: Record<string, ImportTargetField>
  labels: Record<ImportTargetField, string>
}

export type ImportResult = {
  unitsCreated: number
  unitsUpdated: number
  holdersCreated: number
  holdersSkipped: number
  skippedRows: Array<{ index: number; reason: string }>
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

// Campos que deben mapear a una sola columna (no tiene sentido repetirlos).
const UNIQUE_TARGET_FIELDS: ImportTargetField[] = [
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
]

function normalizeHeader(header: string): string {
  return String(header ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // saca acentos
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Mapeo determinístico por nombre de columna (y, como respaldo, por contenido).
// Devuelve null si no hay match claro (ahí entra la IA).
function heuristicTargetForHeader(header: string, samples: unknown[]): ImportTargetField | null {
  const h = normalizeHeader(header)
  if (!h) return null
  const has = (...kw: string[]) => kw.some((k) => h.includes(k))

  // holder_kind ANTES que unit_kind / holder_name ("tipo titular" contiene "tipo" y "titular").
  if (has('tipo titular', 'tipo de titular', 'relacion', 'condicion', 'caracter', 'propietario inquilino', 'prop inquilino')) return 'holder_kind'
  if (has('cuit', 'cuil', 'dni', 'documento')) return 'holder_tax_id'
  if (has('email', 'e mail', 'mail', 'correo')) return 'holder_email'
  if (has('telefono', 'celular', 'whatsapp', 'movil') || h === 'tel' || h === 'cel') return 'holder_phone'
  if (has('alicuota', 'coeficiente', 'coef', 'prorrateo', 'prorrata', 'porcentaje', 'porcentual') || h.includes('%') || h === 'porc') return 'prorata_percent'
  if (has('superficie', 'metros', 'm2', 'mts') || h === 'sup') return 'surface_m2'
  if (has('piso', 'planta', 'nivel')) return 'floor'
  if (has('tipo unidad', 'tipo de unidad', 'clase')) return 'unit_kind'
  if (has('titular', 'propietario', 'dueno', 'responsable', 'apellido', 'nombre', 'vecino', 'ocupante')) return 'holder_name'
  if (has('unidad', 'lote', 'codigo', 'departamento', 'depto', 'manzana', 'parcela') || h === 'cod' || h === 'uf' || h === 'nro' || h === 'numero' || h === 'casa') return 'unit_code'
  if (h === 'tipo') return 'unit_kind'

  // Respaldo por contenido cuando el header no dice nada.
  const sampleStr = samples.map((s) => String(s ?? '')).join(' ')
  if (/@/.test(sampleStr)) return 'holder_email'

  return null
}

export async function analyzeUnitsColumns(input: {
  headers: string[]
  sampleRows: Array<Record<string, unknown>>
}): Promise<AnalyzeColumnsResult> {
  const mapping: Record<string, ImportTargetField> = {}
  const used = new Set<ImportTargetField>()

  // 1) Heurística determinística por nombre de columna (no depende de la IA).
  for (const header of input.headers) {
    const samples = input.sampleRows.map((row) => row[header])
    const target = heuristicTargetForHeader(header, samples)
    if (target && !(UNIQUE_TARGET_FIELDS.includes(target) && used.has(target))) {
      mapping[header] = target
      used.add(target)
    }
  }

  // 2) IA solo para las columnas que la heurística no resolvió. Si falla, no rompe.
  const unresolved = input.headers.filter((header) => !mapping[header])
  if (unresolved.length > 0) {
    try {
      const userPrompt = `Headers:\n${JSON.stringify(unresolved)}\n\nMuestras de filas:\n${JSON.stringify(input.sampleRows, null, 2)}\n\nDevolvé el JSON de mapeo.`
      const raw = await runAIChat({ systemPrompt: SYSTEM_PROMPT, userPrompt, jsonMode: true, temperature: 0, maxTokens: 800 })
      const parsedJson = JSON.parse(stripJsonFences(raw)) as unknown
      if (typeof parsedJson === 'object' && parsedJson !== null) {
        for (const [k, v] of Object.entries(parsedJson as Record<string, unknown>)) {
          if (!unresolved.includes(k)) continue
          if (typeof v === 'string' && v !== 'ignore' && (unitsImportTargetFields as readonly string[]).includes(v)) {
            const target = v as ImportTargetField
            if (UNIQUE_TARGET_FIELDS.includes(target) && used.has(target)) continue
            mapping[k] = target
            used.add(target)
          }
        }
      }
    } catch {
      // IA opcional: si falla o no está configurada, seguimos con la heurística.
    }
  }

  // 3) Todo lo no resuelto queda en "ignore" (editable a mano en el wizard).
  for (const header of input.headers) {
    if (!mapping[header]) mapping[header] = 'ignore'
  }

  return { mapping, labels: UNITS_IMPORT_TARGET_LABELS }
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

export async function executeUnitsImport(input: {
  propertyId: string
  mapping: Record<string, string>
  rows: Array<Record<string, unknown>>
  replaceActiveHolders: boolean
}): Promise<ImportResult> {
  const targetToSource: Record<string, string> = {}
  for (const [source, target] of Object.entries(input.mapping)) {
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

  const existingUnitsRaw = await listUnitsByPropertyMinimalFromPostgres(input.propertyId)
  const existingUnits = new Map<string, string>(
    existingUnitsRaw.map((u) => [String(u.code).trim(), u.id]),
  )

  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i] as Record<string, unknown>

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
        managedPropertyId: input.propertyId,
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

    if (input.replaceActiveHolders) {
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

  return result
}
