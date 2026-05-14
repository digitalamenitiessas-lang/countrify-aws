import { NextRequest } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import {
  buildVecinoContext,
  buildConsorcioContext,
  buildNegocioContext,
  buildSuperAdminContext,
  buildPropietarioContext,
} from '@/lib/ai/context-builders'
import { buildSystemPrompt } from '@/lib/ai/system-prompts'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-8b-instruct:free'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://countrify.com.ar'

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return new Response(JSON.stringify({ error: 'No autenticado.' }), { status: 401 })
  }

  const role = profile.role as 'super_admin' | 'negocio_admin' | 'consorcio_admin' | 'propietario' | 'vecino'

  let messages: { role: 'user' | 'assistant'; content: string }[]
  try {
    const body = await req.json()
    messages = body.messages ?? []
    if (!Array.isArray(messages) || messages.length === 0) throw new Error()
  } catch {
    return new Response(JSON.stringify({ error: 'Payload invalido.' }), { status: 400 })
  }

  let systemPrompt: string
  try {
    let ctx
    switch (role) {
      case 'vecino':
        ctx = await buildVecinoContext(profile.id)
        break
      case 'consorcio_admin':
        ctx = await buildConsorcioContext(profile.id)
        break
      case 'negocio_admin':
        ctx = await buildNegocioContext(profile.id)
        break
      case 'super_admin':
        ctx = await buildSuperAdminContext()
        break
      case 'propietario':
        ctx = await buildPropietarioContext(profile.id)
        break
    }
    if (!ctx) throw new Error('No se pudo construir el contexto.')
    systemPrompt = buildSystemPrompt(ctx)
  } catch (err) {
    console.error('[AI] context error:', err)
    return new Response(JSON.stringify({ error: 'Error al construir contexto.' }), { status: 500 })
  }

  if (!OPENROUTER_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OPENROUTER_API_KEY no configurada en el servidor.' }),
      { status: 500 },
    )
  }

  const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': SITE_URL,
      'X-Title': 'Countrify Assistant',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      stream: true,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 800,
      temperature: 0.7,
    }),
  })

  if (!openRouterResponse.ok) {
    const errText = await openRouterResponse.text()
    console.error('[AI] OpenRouter error:', errText)
    return new Response(JSON.stringify({ error: 'Error al contactar el modelo de IA.' }), { status: 502 })
  }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  ;(async () => {
    const reader = openRouterResponse.body!.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        await writer.write(encoder.encode(chunk))
      }
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
