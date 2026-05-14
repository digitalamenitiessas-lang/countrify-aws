const { createClient } = require('@supabase/supabase-js')
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
} = require('@aws-sdk/client-cognito-identity-provider')

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
}

async function main() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const region = requireEnv('AWS_COGNITO_REGION')
  const userPoolId = requireEnv('AWS_COGNITO_USER_POOL_ID')
  const password = requireEnv('COGNITO_DEV_PASSWORD')

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cognito = new CognitoIdentityProviderClient({ region })

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .not('email', 'is', null)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch profiles from Supabase: ${error.message}`)
  }

  const deduped = new Map()
  for (const row of profiles || []) {
    const email = normalizeEmail(row.email)
    if (!email) continue
    if (!deduped.has(email)) {
      deduped.set(email, {
        id: row.id,
        email,
        fullName: row.full_name || 'Usuario Countrify',
        role: row.role || null,
      })
    }
  }

  const users = Array.from(deduped.values())
  let created = 0
  let updated = 0

  for (const user of users) {
    const username = user.email

    let exists = false
    try {
      await cognito.send(
        new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: username,
        }),
      )
      exists = true
    } catch (err) {
      if (err?.name !== 'UserNotFoundException') {
        throw err
      }
    }

    const attributes = [
      { Name: 'email', Value: user.email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'name', Value: user.fullName },
    ]

    if (!exists) {
      await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: username,
          MessageAction: 'SUPPRESS',
          TemporaryPassword: password,
          UserAttributes: attributes,
        }),
      )
      created += 1
    } else {
      await cognito.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: username,
          UserAttributes: attributes,
        }),
      )
      updated += 1
    }

    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: username,
        Password: password,
        Permanent: true,
      }),
    )

    process.stdout.write(`Synced ${username}\n`)
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        total: users.length,
        created,
        updated,
        passwordMode: 'permanent',
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
