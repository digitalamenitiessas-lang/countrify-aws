// Lambda Node.js 20 — invoca el endpoint /api/cron/generate-reminders en
// countrify.com.ar con bearer auth. Lo dispara EventBridge schedule.
//
// Env vars esperados:
//   - TARGET_URL: URL completa al endpoint (ej https://countrify.com.ar/api/cron/generate-reminders)
//   - SECRET_ID: nombre del secret en Secrets Manager (ej countrify/prod/cron-secret)
//
// El bearer no se hardcodea: se lee de Secrets Manager en cada invocación
// (Lambda runtime cachea container, así que en práctica se lee 1x por warm start).

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

const sm = new SecretsManagerClient({})
let cachedSecret = null

async function getSecret() {
  if (cachedSecret) return cachedSecret
  const res = await sm.send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ID }))
  cachedSecret = res.SecretString
  return cachedSecret
}

export async function handler(event) {
  const url = process.env.TARGET_URL
  if (!url) throw new Error('TARGET_URL no configurado')

  const secret = await getSecret()
  const started = Date.now()

  console.log(`[cron-reminders] POST ${url}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })

  const text = await res.text()
  const elapsedMs = Date.now() - started
  console.log(`[cron-reminders] status=${res.status} elapsedMs=${elapsedMs} body=${text.slice(0, 2000)}`)

  if (!res.ok) {
    throw new Error(`cron endpoint returned ${res.status}: ${text.slice(0, 500)}`)
  }

  return {
    ok: true,
    status: res.status,
    elapsedMs,
    summary: safeJson(text)?.summary ?? null,
  }
}

function safeJson(s) {
  try { return JSON.parse(s) } catch { return null }
}
