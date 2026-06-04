// Parser de tabla pegada (copiada de Excel/Sheets) para la carga masiva de
// vecinos a unidades. NO importa nada de servidor: es seguro importarlo desde
// el wizard cliente (para tipos) y desde las server actions.
//
// Entrada: un string con varias filas (delimitadas por tab o coma). Columnas
// esperadas: unidad, nombre, email, relación, [teléfono]. Detecta header por
// alias; si no hay header reconocible, asume orden posicional.

import type { UnitProfileRelationship } from '@/lib/types'

export interface ParsedRow {
  sourceLine: number // 1-based, sobre las filas de datos no vacías del paste
  unitCode: string
  fullName: string
  email: string
  phone: string
  // relación cruda y relación resuelta (null = no reconocida)
  relationshipRaw: string
  relationshipType: UnitProfileRelationship | null
}

export interface ParseResult {
  rows: ParsedRow[]
  hadHeader: boolean
}

// Estado de cada fila en el preview del wizard. El servidor es la fuente de
// verdad: el wizard re-llama preview cada vez que el usuario edita.
export type PreviewStatus = 'will_create' | 'reuse_existing' | 'duplicate_row' | 'error'

export type PreviewErrorCode =
  | 'missing_unit'
  | 'missing_name'
  | 'missing_email'
  | 'invalid_email'
  | 'invalid_relationship'
  | 'unknown_unit'
  | 'email_other_building'

export interface PreviewRow {
  sourceLine: number
  unitCode: string
  unitId: string | null
  fullName: string
  email: string
  phone: string
  relationshipRaw: string
  relationshipType: UnitProfileRelationship | null
  status: PreviewStatus
  errorCode: PreviewErrorCode | null
  message: string | null
}

export interface PreviewSummary {
  total: number
  valid: number
  errors: number
  willCreate: number
  reuseExisting: number
  duplicates: number
}

export interface PreviewResult {
  rows: PreviewRow[]
  summary: PreviewSummary
}

// Fila ya validada y editada que el wizard manda a confirmar.
export interface ConfirmRowInput {
  sourceLine: number
  unitId: string
  fullName: string
  email: string
  phone: string | null
  relationshipType: UnitProfileRelationship
}

type ColumnKey = 'unitCode' | 'fullName' | 'email' | 'phone' | 'relationship'

const columnAliases: Record<ColumnKey, string[]> = {
  unitCode: ['unit_code', 'unitcode', 'unidad', 'depto', 'dpto', 'apto', 'apartamento', 'departamento', 'unidad_funcional', 'uf', 'lote'],
  fullName: ['full_name', 'fullname', 'nombre', 'nombre_completo', 'nombre_y_apellido', 'titular', 'residente'],
  email: ['email', 'mail', 'correo', 'correo_electronico', 'e_mail'],
  phone: ['phone', 'telefono', 'teléfono', 'celular', 'movil', 'móvil', 'whatsapp'],
  relationship: ['relationship', 'relationship_type', 'relacion', 'vinculo', 'rol', 'tipo', 'condicion', 'condición', 'parentesco'],
}

const ownerKeywords = ['propietario', 'titular', 'dueño', 'dueno', 'owner']
const primaryKeywords = ['vecino_principal', 'principal', 'residente', 'habitante', 'inquilino']
const additionalKeywords = ['vecino_adicional', 'adicional', 'conviviente', 'familiar', 'grupo familiar']

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// Resuelve el texto de relación a una relación válida de vecino. Vacío →
// vecino_principal (caso más común al pegar una lista de titulares). No
// reconocido → null (la fila quedará marcada como error en el preview).
export function parseRelationship(value: string): UnitProfileRelationship | null {
  const normalized = normalizeText(value).replace(/_/g, ' ')
  if (!normalized) return 'vecino_principal'

  const includesAny = (keywords: string[]) =>
    keywords.some((kw) => normalized.includes(normalizeText(kw).replace(/_/g, ' ')))

  if (includesAny(ownerKeywords)) return 'vecino_principal'
  if (includesAny(primaryKeywords)) return 'vecino_principal'
  if (includesAny(additionalKeywords)) return 'vecino_adicional'

  const collapsed = normalized.replace(/ /g, '_')
  if (collapsed === 'vecino_principal' || collapsed === 'vecino_adicional') {
    return collapsed
  }
  return null
}

function detectHeader(cells: string[]): Partial<Record<ColumnKey, number>> | null {
  const mapping: Partial<Record<ColumnKey, number>> = {}
  cells.forEach((cell, index) => {
    const norm = normalizeText(cell)
    for (const [key, aliases] of Object.entries(columnAliases) as Array<[ColumnKey, string[]]>) {
      if (mapping[key] === undefined && aliases.includes(norm)) {
        mapping[key] = index
      }
    }
  })
  // Consideramos header válido si reconocimos ≥2 columnas conocidas.
  const matched = Object.keys(mapping).length
  return matched >= 2 ? mapping : null
}

export function parsePastedTable(pasted: string): ParseResult {
  const lines = pasted
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  if (lines.length === 0) {
    return { rows: [], hadHeader: false }
  }

  // Delimitador: tab si alguna línea lo tiene (paste de planilla); si no, coma.
  const useTab = lines.some((line) => line.includes('\t'))
  const splitCells = (line: string) =>
    (useTab ? line.split('\t') : line.split(',')).map((c) => c.trim())

  const firstCells = splitCells(lines[0])
  const header = detectHeader(firstCells)

  const dataLines = header ? lines.slice(1) : lines
  // Posiciones por defecto: unidad, nombre, email, relación, [teléfono].
  const pos: Record<ColumnKey, number> = header
    ? {
        unitCode: header.unitCode ?? 0,
        fullName: header.fullName ?? 1,
        email: header.email ?? 2,
        relationship: header.relationship ?? 3,
        phone: header.phone ?? 4,
      }
    : { unitCode: 0, fullName: 1, email: 2, relationship: 3, phone: 4 }

  const rows: ParsedRow[] = dataLines.map((line, index) => {
    const cells = splitCells(line)
    const at = (key: ColumnKey) => (cells[pos[key]] ?? '').trim()
    const relationshipRaw = at('relationship')
    return {
      sourceLine: index + 1,
      unitCode: at('unitCode'),
      fullName: at('fullName'),
      email: at('email'),
      phone: at('phone'),
      relationshipRaw,
      relationshipType: parseRelationship(relationshipRaw),
    }
  })

  return { rows, hadHeader: Boolean(header) }
}
