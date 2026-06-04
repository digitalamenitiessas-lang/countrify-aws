'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { runAIChat, stripJsonFences } from '@/lib/iadmin/ai-chat'
import { getIAdminAdministrationByIdFromPostgres, insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import { getManagedPropertyContextFromPostgres } from '@/lib/db/iadmin-writes'
import {
  deleteAnnouncementInPostgres,
  getAnnouncementAdminContextFromPostgres,
  insertAnnouncementInPostgres,
  updateAnnouncementInPostgres,
} from '@/lib/db/announcements'
import { pgQuery } from '@/lib/db/postgres'
import { notifyAnnouncementPublished } from '@/lib/email/notifications/announcements'

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

  const admin = await getIAdminAdministrationByIdFromPostgres(parsed.administrationId)

  let propertyContext = ''
  if (parsed.managedPropertyId) {
    const prop = await getManagedPropertyContextFromPostgres(parsed.managedPropertyId)
    if (prop) {
      const propertyName = prop.display_name ?? prop.building_name ?? ''
      if (propertyName || prop.building_address) {
        propertyContext = `\n- Consorcio: ${propertyName || prop.building_name || '—'}${prop.building_address ? ` (${prop.building_address})` : ''}`
      }
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

// ----------------------------------------------------------------------------
// Publish / edit / delete announcements. El admin compone con o sin AI y
// despues publica: persistimos + disparamos mail a vecinos opt-in.
// ----------------------------------------------------------------------------

const publishSchema = z.object({
  buildingId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(8000),
  pinned: z.boolean().optional().default(false),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

async function assertAdminOwnsBuilding(buildingId: string): Promise<{
  administrationId: string
  profileId: string
}> {
  // El building debe pertenecer a un managed_property que esté bajo la
  // administración del usuario logueado. Confirmamos eso + capability.
  const res = await pgQuery<{ administration_id: string }>(
    `select mp.administration_id
       from public.iadmin_managed_properties mp
      where mp.building_id = $1
      limit 1`,
    [buildingId],
  )
  const administrationId = res.rows[0]?.administration_id
  if (!administrationId) {
    throw new Error('El edificio no está asociado a una administración.')
  }
  const { profile } = await requireIAdmin({
    capability: 'communications.send',
    administrationId,
  })
  return { administrationId, profileId: profile.id }
}

export async function publishAnnouncement(input: z.input<typeof publishSchema>) {
  const parsed = publishSchema.parse(input)
  const { administrationId, profileId } = await assertAdminOwnsBuilding(parsed.buildingId)

  const expiresAt = parsed.expiresAt
    ? new Date(`${parsed.expiresAt}T23:59:59-03:00`).toISOString()
    : null

  const { id } = await insertAnnouncementInPostgres({
    buildingId: parsed.buildingId,
    authorProfileId: profileId,
    title: parsed.title,
    body: parsed.body,
    pinned: parsed.pinned ?? false,
    expiresAt,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId,
    actorProfileId: profileId,
    entityType: 'building_announcements',
    entityId: id,
    action: 'announcement.published',
    metadata: { building_id: parsed.buildingId, title: parsed.title, pinned: parsed.pinned ?? false },
  })

  // Mail a vecinos opt-in fire-and-forget.
  void notifyAnnouncementPublished(id)

  revalidatePath('/iadmin/comunicaciones')
  revalidatePath('/usuario')
  return { id }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(8000),
  pinned: z.boolean().optional().default(false),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

export async function updateAnnouncement(input: z.input<typeof updateSchema>) {
  const parsed = updateSchema.parse(input)
  const ctx = await getAnnouncementAdminContextFromPostgres(parsed.id)
  if (!ctx) throw new Error('Comunicado no encontrado.')

  const { profile } = await requireIAdmin({
    capability: 'communications.send',
    administrationId: ctx.administration_id,
  })

  const expiresAt = parsed.expiresAt
    ? new Date(`${parsed.expiresAt}T23:59:59-03:00`).toISOString()
    : null

  await updateAnnouncementInPostgres({
    id: parsed.id,
    title: parsed.title,
    body: parsed.body,
    pinned: parsed.pinned ?? false,
    expiresAt,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: ctx.administration_id,
    actorProfileId: profile.id,
    entityType: 'building_announcements',
    entityId: parsed.id,
    action: 'announcement.updated',
    metadata: { title: parsed.title, pinned: parsed.pinned ?? false },
  })

  revalidatePath('/iadmin/comunicaciones')
  revalidatePath('/usuario')
  return { ok: true }
}

export async function deleteAnnouncement(id: string) {
  const ctx = await getAnnouncementAdminContextFromPostgres(id)
  if (!ctx) throw new Error('Comunicado no encontrado.')

  const { profile } = await requireIAdmin({
    capability: 'communications.send',
    administrationId: ctx.administration_id,
  })

  await deleteAnnouncementInPostgres(id)

  await insertIAdminAuditLogInPostgres({
    administrationId: ctx.administration_id,
    actorProfileId: profile.id,
    entityType: 'building_announcements',
    entityId: id,
    action: 'announcement.deleted',
    metadata: {},
  })

  revalidatePath('/iadmin/comunicaciones')
  revalidatePath('/usuario')
  return { ok: true }
}
