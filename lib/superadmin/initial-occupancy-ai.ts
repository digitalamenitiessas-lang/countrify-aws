import { z } from 'zod'

const importMappingSchema = z.object({
  mapping: z.object({
    unitCode: z.string().nullable().optional(),
    floor: z.string().nullable().optional(),
    fullName: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    relationship: z.string().nullable().optional(),
    primary: z.string().nullable().optional(),
    unitKind: z.string().nullable().optional(),
  }),
  ownerKeywords: z.array(z.string()).optional().default([]),
  primaryKeywords: z.array(z.string()).optional().default([]),
  additionalKeywords: z.array(z.string()).optional().default([]),
  notes: z.array(z.string()).optional().default([]),
})

export type InitialOccupancyImportAIMapping = z.infer<typeof importMappingSchema>

const SYSTEM_PROMPT = `Sos un asistente experto en padrones de vecinos y propietarios para edificios/consorcios en Argentina.

Recibiras encabezados de una planilla Excel y algunas filas de ejemplo. Tu tarea es identificar que columna corresponde a cada campo interno de Countrify y devolver UNICAMENTE un JSON valido.

Campos internos esperados:
- unitCode: codigo de unidad/departamento/depto/apto/lote
- floor: piso
- fullName: nombre completo de la persona
- email: email
- phone: telefono
- relationship: columna que indique propietario, titular, residente, principal, conviviente o similar
- primary: columna booleana/flag que indique titular/principal
- unitKind: tipo de unidad (departamento, casa, local, cochera, etc)

Tambien devolve listas cortas de keywords para inferir relationship si la columna es ambigua:
- ownerKeywords
- primaryKeywords
- additionalKeywords

Reglas:
- Si no detectas una columna, devolve null.
- Los nombres devueltos en mapping deben coincidir EXACTAMENTE con uno de los encabezados recibidos.
- No inventes encabezados que no existan.
- notes puede incluir advertencias breves.
- Responde SOLO JSON, sin markdown ni texto extra.`

export async function inferInitialOccupancyMapping(input: {
  buildingName: string
  sheetName: string
  headers: string[]
  sampleRows: Record<string, string>[]
}): Promise<InitialOccupancyImportAIMapping> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return {
      mapping: {},
      ownerKeywords: [],
      primaryKeywords: [],
      additionalKeywords: [],
      notes: ['OPENROUTER_API_KEY no configurada; se usaron solo heuristicas locales.'],
    }
  }

  const model = process.env.IADMIN_AI_MODEL || 'anthropic/claude-3.5-haiku'
  const content = {
    buildingName: input.buildingName,
    sheetName: input.sheetName,
    headers: input.headers,
    sampleRows: input.sampleRows.slice(0, 15),
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://countrify.com.ar',
      'X-Title': 'Countrify SuperAdmin Import',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Analiza esta planilla del edificio ${input.buildingName} y devuelve el mapeo.\n${JSON.stringify(content)}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter error ${response.status}: ${text.slice(0, 300)}`)
  }

  const body = await response.json()
  const raw = body?.choices?.[0]?.message?.content
  if (typeof raw !== 'string') {
    throw new Error('Respuesta de IA vacia o inesperada')
  }

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()

  const parsed = JSON.parse(cleaned)
  const result = importMappingSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Respuesta invalida al mapear planilla: ${result.error.message}`)
  }

  return result.data
}
