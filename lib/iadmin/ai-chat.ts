/**
 * Helper genérico para llamar al modelo via OpenRouter con texto (sin archivos).
 * Usado para: redacción de comunicados, proyecciones, análisis narrativo.
 */

type ChatInput = {
  systemPrompt: string
  userPrompt: string
  model?: string
  jsonMode?: boolean
  temperature?: number
  maxTokens?: number
}

export async function runAIChat(input: ChatInput): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY no configurada')
  }

  const model = input.model || process.env.IADMIN_AI_MODEL || 'anthropic/claude-3.5-haiku'

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
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
      temperature: input.temperature ?? 0.3,
      max_tokens: input.maxTokens ?? 1200,
      ...(input.jsonMode ? { response_format: { type: 'json_object' } } : {}),
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

  return raw.trim()
}

export function stripJsonFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
}
