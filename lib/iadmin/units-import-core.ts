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
  // Titular genérico: para planillas simples con UNA columna de persona + una
  // columna de tipo (propietario/inquilino/...). holder_kind define el vínculo.
  'holder_name',
  'holder_kind',
  'holder_tax_id',
  'holder_email',
  'holder_phone',
  // Propietario (dueño). Siempre se crea como holder con kind='propietario'.
  // Para planillas con columnas separadas Propietario + Inquilino.
  'owner_name',
  'owner_tax_id',
  'owner_email',
  'owner_phone',
  // Inquilino. Siempre se crea como holder con kind='inquilino'.
  'tenant_name',
  'tenant_tax_id',
  'tenant_email',
  'tenant_phone',
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
  owner_name: 'Nombre propietario',
  owner_tax_id: 'CUIT / DNI propietario',
  owner_email: 'Email propietario',
  owner_phone: 'Teléfono propietario',
  tenant_name: 'Nombre inquilino',
  tenant_tax_id: 'CUIT / DNI inquilino',
  tenant_email: 'Email inquilino',
  tenant_phone: 'Teléfono inquilino',
  ignore: 'Ignorar columna',
}

export type AnalyzeColumnsResult = {
  mapping: Record<string, ImportTargetField>
  labels: Record<ImportTargetField, string>
}

export type ImportResult = {
  unitsCreated: number
  unitsUpdated: number
  /** Titulares genéricos creados desde columnas holder_* (planillas de una sola persona). */
  holdersCreated: number
  /** Propietarios creados como titular con vínculo 'propietario' desde columnas owner_*. */
  ownersCreated: number
  /** Inquilinos creados como titular con vínculo 'inquilino' desde columnas tenant_*. */
  tenantsCreated: number
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
- holder_name: nombre completo del titular principal (quien usa la unidad: dueño residente o inquilino)
- holder_kind: tipo de relacion (propietario, inquilino, apoderado, otro)
- holder_tax_id: CUIT o DNI del titular principal
- holder_email: email del titular principal
- holder_phone: telefono del titular principal
- owner_name: nombre del PROPIETARIO (dueño de la unidad). Se crea como titular con vínculo "propietario".
- owner_tax_id: CUIT o DNI del propietario
- owner_email: email del propietario
- owner_phone: telefono del propietario
- tenant_name: nombre del INQUILINO (quien alquila / ocupa la unidad sin ser dueño). Se crea como titular con vínculo "inquilino".
- tenant_tax_id: CUIT o DNI del inquilino
- tenant_email: email del inquilino
- tenant_phone: telefono del inquilino
- ignore: columna que no matchea con ninguno de los anteriores (ej. "Estado Ocupación", "Vencimiento de contrato", saldos, recibos)

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
- IMPORTANTE: si la planilla tiene columnas SEPARADAS para el dueño y para quien alquila (ej. "Propietario" + "Inquilino", o "Dueño" + "Locatario"), mapeá las del dueño a owner_* y las del inquilino a tenant_*. NO uses holder_* en ese caso.
- Las columnas que mencionan "propietario", "dueño", "owner", "titular dominial" van a owner_name/owner_tax_id/owner_email/owner_phone.
- Las columnas que mencionan "inquilino", "locatario", "tenant", "arrendatario" van a tenant_name/tenant_tax_id/tenant_email/tenant_phone.
- Usá holder_* SOLO cuando hay UNA sola persona por unidad sin distinción de rol (planilla simple con una columna "Titular"/"Responsable" y opcionalmente una columna de tipo).
- "Estado Ocupación" / "Ocupación" / "Vto. Contrato" / "Vencimiento" / saldos / recibos / expensas van a ignore.
- Si no matchea con ninguno, devolver "ignore".
- Devolvé SOLO el JSON, sin texto adicional.`

// Campos que deben mapear a una sola columna (no tiene sentido repetirlos).
const UNIQUE_TARGET_FIELDS: ImportTargetField[] = [
  'unit_code', 'unit_kind', 'floor', 'surface_m2', 'prorata_percent',
  'holder_name', 'holder_kind', 'holder_tax_id', 'holder_email', 'holder_phone',
  'owner_name', 'owner_tax_id', 'owner_email', 'owner_phone',
  'tenant_name', 'tenant_tax_id', 'tenant_email', 'tenant_phone',
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
// Reconoce el patrón de columnas separadas propietario/inquilino. Devuelve null
// si no hay match claro (ahí entra la IA).
function heuristicTargetForHeader(header: string, samples: unknown[]): ImportTargetField | null {
  const h = normalizeHeader(header)
  if (!h) return null
  const has = (...kw: string[]) => kw.some((k) => h.includes(k))

  const isEmail = has('email', 'e mail', 'mail', 'correo')
  const isPhone = has('telefono', 'celular', 'whatsapp', 'movil') || h === 'tel' || h === 'cel'
  const isTax = has('cuit', 'cuil', 'dni', 'documento')
  const isOwnerQualified = has('propietario', 'dueno', 'titular dominial', 'owner')
  const isTenantQualified = has('inquilino', 'locatario', 'arrendatario', 'tenant')

  // tipo titular / relación va a holder_kind (antes de cualquier otra cosa con "tipo"/"titular")
  if (has('tipo titular', 'tipo de titular', 'relacion', 'condicion', 'caracter')) return 'holder_kind'

  // Columnas calificadas como propietario
  if (isOwnerQualified) {
    if (isEmail) return 'owner_email'
    if (isPhone) return 'owner_phone'
    if (isTax) return 'owner_tax_id'
    return 'owner_name'
  }
  // Columnas calificadas como inquilino
  if (isTenantQualified) {
    if (isEmail) return 'tenant_email'
    if (isPhone) return 'tenant_phone'
    if (isTax) return 'tenant_tax_id'
    return 'tenant_name'
  }

  // Campos genéricos (sin calificador de rol)
  if (isTax) return 'holder_tax_id'
  if (isEmail) return 'holder_email'
  if (isPhone) return 'holder_phone'
  if (has('alicuota', 'coeficiente', 'coef', 'prorrateo', 'prorrata', 'porcentaje', 'porcentual') || h.includes('%') || h === 'porc') return 'prorata_percent'
  if (has('superficie', 'metros', 'm2', 'mts') || h === 'sup') return 'surface_m2'
  if (has('piso', 'planta', 'nivel')) return 'floor'
  if (has('tipo unidad', 'tipo de unidad', 'clase')) return 'unit_kind'
  if (has('titular', 'responsable', 'apellido', 'nombre', 'vecino', 'ocupante')) return 'holder_name'
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

// No asumir 'propietario': si la columna no vino o no se reconoce, dejamos el
// vínculo neutro 'otro'. El admin lo corrige después en la unidad.
function normalizeHolderKind(raw: unknown): string {
  const s = String(raw ?? '').toLowerCase().trim()
  if (!s) return 'otro'
  for (const [k, v] of Object.entries(holderKindMap)) {
    if (s.includes(k)) return v
  }
  return 'otro'
}

// Trata guiones/placeholders ("-", "–", "—", "n/a", "s/d", "sin datos", "null")
// como celda vacía. Sin esto, una celda con "–" se importaba como un titular
// fantasma llamado "–".
function cleanCell(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (/^[-–—.]+$/.test(s)) return ''
  const low = s.toLowerCase().replace(/[\s./]/g, '')
  if (['na', 'sd', 'sindatos', 'sininfo', 'null', 'none', 'nc'].includes(low)) return ''
  return s
}

function normalizeProrata(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const original = String(raw).trim()
  if (!original) return null
  const hadPercent = original.includes('%')
  // Coma decimal (es-AR): "1,375" -> "1.375". Si hay coma Y punto (formato
  // "1.234,56") el punto es separador de miles, lo quitamos.
  let s = original.replace('%', '').replace(/\s/g, '')
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  }
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  // Si venía con signo %, es porcentaje sí o sí -> coeficiente = n / 100.
  // (Antes "1,375%" caía en n<=1.5 y se guardaba como 1.375 = 137.5%.)
  if (hadPercent) return n / 100
  // Sin signo %: heurística. >1.5 se asume porcentaje (12.5 -> 0.125);
  // <=1.5 se asume coeficiente decimal ya normalizado (0.125).
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
    ownersCreated: 0,
    tenantsCreated: 0,
    holdersSkipped: 0,
    skippedRows: [],
  }

  // Crea un holder (titular) de un vínculo dado, reemplazando los activos del
  // mismo kind si replaceActiveHolders está habilitado. Devuelve true si insertó.
  const createHolder = async (holder: {
    unitId: string
    fullName: string
    holderKind: string
    taxId: string
    email: string
    phone: string
  }): Promise<boolean> => {
    if (input.replaceActiveHolders) {
      await closeActiveHoldersOfKindInPostgres({ unitId: holder.unitId, holderKind: holder.holderKind })
    }
    try {
      await insertUnitHolderInPostgres({
        unitId: holder.unitId,
        fullName: holder.fullName,
        holderKind: holder.holderKind,
        taxId: holder.taxId || null,
        email: holder.email || null,
        phone: holder.phone || null,
      })
      return true
    } catch {
      result.holdersSkipped += 1
      return false
    }
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
    const floor = cleanCell(readField(row, 'floor')) || null
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

    // --- Propietario (columnas owner_*) → titular con vínculo 'propietario' ---
    const ownerName = cleanCell(readField(row, 'owner_name'))
    if (ownerName) {
      const created = await createHolder({
        unitId,
        fullName: ownerName,
        holderKind: 'propietario',
        taxId: cleanCell(readField(row, 'owner_tax_id')),
        email: cleanCell(readField(row, 'owner_email')),
        phone: cleanCell(readField(row, 'owner_phone')),
      })
      if (created) result.ownersCreated += 1
    }

    // --- Inquilino (columnas tenant_*) → titular con vínculo 'inquilino' ---
    const tenantName = cleanCell(readField(row, 'tenant_name'))
    if (tenantName) {
      const created = await createHolder({
        unitId,
        fullName: tenantName,
        holderKind: 'inquilino',
        taxId: cleanCell(readField(row, 'tenant_tax_id')),
        email: cleanCell(readField(row, 'tenant_email')),
        phone: cleanCell(readField(row, 'tenant_phone')),
      })
      if (created) result.tenantsCreated += 1
    }

    // --- Titular genérico (columnas holder_*) ---
    // Sólo para planillas simples con UNA persona por unidad. Evitamos duplicar
    // si coincide con el propietario o el inquilino ya creados.
    const holderName = cleanCell(readField(row, 'holder_name'))
    const holderDuplicatesOwner = holderName !== '' && holderName.toLowerCase() === ownerName.toLowerCase()
    const holderDuplicatesTenant = holderName !== '' && holderName.toLowerCase() === tenantName.toLowerCase()

    if (holderName && !holderDuplicatesOwner && !holderDuplicatesTenant) {
      const created = await createHolder({
        unitId,
        fullName: holderName,
        holderKind: normalizeHolderKind(readField(row, 'holder_kind')),
        taxId: cleanCell(readField(row, 'holder_tax_id')),
        email: cleanCell(readField(row, 'holder_email')),
        phone: cleanCell(readField(row, 'holder_phone')),
      })
      if (created) result.holdersCreated += 1
    }
  }

  return result
}
