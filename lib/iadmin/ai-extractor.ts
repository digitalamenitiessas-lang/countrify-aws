import { z } from 'zod'

// Schema del JSON que le pedimos al modelo
const extractionSchema = z.object({
  provider_name: z.string().nullable().optional(),
  provider_tax_id: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional().default('ARS'),
  issued_at: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  confidence: z.number().min(0).max(100).nullable().optional().default(0),
})

export type AIExtractionResult = z.infer<typeof extractionSchema>

const SYSTEM_PROMPT = `Sos un asistente experto en procesar facturas y comprobantes de gastos de consorcios/edificios en Argentina.

Dado un documento (imagen o PDF), extraes de forma estructurada los siguientes campos y devolves ÚNICAMENTE un objeto JSON valido, sin texto adicional, sin markdown, sin comentarios.

Formato de salida:
{
  "provider_name": "nombre del proveedor/emisor de la factura",
  "provider_tax_id": "CUIT si aparece (formato XX-XXXXXXXX-X) o null",
  "amount": numero con decimales del TOTAL a pagar (no el neto),
  "currency": "ARS" | "USD" | otra ISO,
  "issued_at": "YYYY-MM-DD fecha de emision",
  "due_at": "YYYY-MM-DD vencimiento primario o null",
  "category": una de estas palabras: "Mantenimiento" | "Seguridad" | "Limpieza" | "Luz" | "Gas" | "Agua" | "Seguros" | "Honorarios" | "Ascensores" | "Pileta" | "Jardineria" | "Servicios tecnicos" | "Impuestos" | "Otros",
  "description": descripcion breve del servicio/producto (max 120 chars),
  "confidence": numero 0-100 que indica cuan confiado estas de la extraccion completa
}

Reglas:
- Si un campo no aparece en el documento, devolvelo como null.
- El total siempre debe incluir IVA si aparece.
- Fecha en formato ISO estricto.
- Nunca devuelvas markdown, solo JSON plano.
- Si el documento no parece una factura/comprobante valido, devolve confidence: 0.`

type CallInput = {
  fileBase64: string
  mimeType: string
  fileName: string
}

function isImage(mime: string) {
  return mime.startsWith('image/')
}

function isPdf(mime: string) {
  return mime === 'application/pdf'
}

export async function runAIExtraction(input: CallInput): Promise<AIExtractionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY no configurada')
  }

  const model = process.env.IADMIN_AI_MODEL || 'anthropic/claude-3.5-haiku'

  // Content: texto + archivo. Formato OpenRouter compatible con OpenAI.
  // Para imágenes: type=image_url. Para PDFs: type=file (OpenRouter specific).
  const content: any[] = [
    {
      type: 'text',
      text: 'Analiza este comprobante y devolvé el JSON con los campos extraídos. Recordá: SOLO JSON, sin texto extra.',
    },
  ]

  if (isImage(input.mimeType)) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${input.mimeType};base64,${input.fileBase64}` },
    })
  } else if (isPdf(input.mimeType)) {
    content.push({
      type: 'file',
      file: {
        filename: input.fileName,
        file_data: `data:application/pdf;base64,${input.fileBase64}`,
      },
    })
  } else {
    throw new Error(`Tipo de archivo no soportado: ${input.mimeType}`)
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://countrify.com.ar',
      'X-Title': 'Countrify IAdmin',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      temperature: 0,
      max_tokens: 800,
      response_format: { type: 'json_object' },
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

  // Claude a veces devuelve JSON envuelto en ```json ... ```
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`No se pudo parsear JSON de la IA: ${cleaned.slice(0, 200)}`)
  }

  const result = extractionSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Campos invalidos de la IA: ${result.error.message}`)
  }

  return result.data
}
