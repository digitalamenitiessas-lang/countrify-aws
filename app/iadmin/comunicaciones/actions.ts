'use server'

import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { runAIChat, stripJsonFences } from '@/lib/iadmin/ai-chat'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const draftSchema = z.object({
  administrationId: z.string().uuid(),
  managedPropertyId: z.string().uuid().optional(),
  topic: z.string().trim().min(5).max(600),
  extraContext: z.string().trim().max(1000).optional(),
})

export type GenerateAnnouncementInput = z.input<typeof draftSchema>

export type AnnouncementDraft = {
  formal: string
  email: string
  whatsapp: string
  subjectSuggestion: string
}

const SYSTEM_PROMPT = `Sos un asistente para administradores de consorcios/edificios en Argentina. Tu tarea es redactar comunicados para vecinos a partir de un topic que te pasa el administrador.

Devolvés SIEMPRE un JSON con EXACTAMENTE estos campos:
{
  "subjectSuggestion": "asunto corto (max 80 chars, sin emojis)",
  "formal": "texto formal impreso o cartelera, firmado por la administracion. Max 600 palabras.",
  "email": "version email formal, con saludo y cierre. Max 400 palabras.",
  "whatsapp": "version para WhatsApp: corta, directa, con algun emoji si corresponde. Max 180 palabras."
}

Reglas:
- Nunca inventes datos concretos (montos, fechas, nombres propios) si no te los dan.
- Mantene el tono respetuoso. No uses lenguaje coloquial fuerte.
- Si el topic menciona aumentos o decisiones sensibles, aclarar brevemente el motivo si el admin lo dio.
- Usá español rioplatense (vos, tenés, pueden).
- Devolvé SOLO el JSON, sin markdown ni comentarios.`

export async function generateAnnouncement(
  input: GenerateAnnouncementInput,
): Promise<AnnouncementDraft> {
  const parsed = draftSchema.parse(input)
  await requireIAdmin({
    capability: 'communications.send',
    administrationId: parsed.administrationId,
  })

  const supabase = await getSupabaseServerClient()
  if (!supabase) throw new Error('Supabase no configurado')

  // Contexto: administracion + consorcio (si aplica)
  const { data: admin } = await supabase
    .from('iadmin_administrations')
    .select('name, legal_name')
    .eq('id', parsed.administrationId)
    .maybeSingle()

  let propertyName = ''
  let propertyContext = ''
  if (parsed.managedPropertyId) {
    const { data: prop } = await supabase
      .from('iadmin_managed_properties')
      .select('display_name, buildings(name, address)')
      .eq('id', parsed.managedPropertyId)
      .maybeSingle()
    const building = prop?.buildings
      ? Array.isArray(prop.buildings)
        ? prop.buildings[0]
        : prop.buildings
      : null
    propertyName = prop?.display_name ?? building?.name ?? ''
    if (propertyName || building?.address) {
      propertyContext = `\n- Consorcio: ${propertyName || building?.name || '—'}${building?.address ? ` (${building.address})` : ''}`
    }
  }

  const userPrompt = `
Datos del contexto:
- Administracion: ${admin?.legal_name ?? admin?.name ?? '—'}${propertyContext}
- Fecha actual: ${new Date().toISOString().slice(0, 10)}

Topic del comunicado:
"${parsed.topic}"

${parsed.extraContext ? `Contexto adicional provisto por el administrador:\n"${parsed.extraContext}"\n` : ''}

Generá las 3 versiones como JSON.`

  const raw = await runAIChat({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    jsonMode: true,
    temperature: 0.4,
    maxTokens: 1400,
  })

  const cleaned = stripJsonFences(raw)
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(cleaned)
  } catch {
    throw new Error('La IA devolvio un formato invalido')
  }

  const resultSchema = z.object({
    formal: z.string().min(10),
    email: z.string().min(10),
    whatsapp: z.string().min(5),
    subjectSuggestion: z.string().min(3).max(120),
  })

  const result = resultSchema.safeParse(parsedJson)
  if (!result.success) {
    throw new Error('Respuesta de IA incompleta')
  }

  return result.data
}
