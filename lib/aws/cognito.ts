import { randomInt } from 'node:crypto'
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AuthFlowType,
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  InitiateAuthCommand,
  MessageActionType,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider'

type CognitoEnv = {
  region: string
  userPoolId: string
  clientId: string
}

export type CognitoPoolSource = 'primary' | 'business'

let cognitoClient: CognitoIdentityProviderClient | null = null

export function getCognitoEnv(): CognitoEnv | null {
  const region = process.env.AWS_COGNITO_REGION?.trim()
  const userPoolId = process.env.AWS_COGNITO_USER_POOL_ID?.trim()
  const clientId = process.env.AWS_COGNITO_CLIENT_ID?.trim()

  if (!region || !userPoolId || !clientId) {
    return null
  }

  return { region, userPoolId, clientId }
}

export function getBusinessCognitoEnv(): CognitoEnv | null {
  const region = process.env.AWS_COGNITO_REGION?.trim()
  const userPoolId = process.env.AWS_COGNITO_BUSINESS_USER_POOL_ID?.trim()
  const clientId = process.env.AWS_COGNITO_BUSINESS_CLIENT_ID?.trim()

  if (!region || !userPoolId || !clientId) {
    return null
  }

  return { region, userPoolId, clientId }
}

// Genera una contraseña temporal de 14 chars con al menos 1 de cada clase
// (mayúscula, minúscula, dígito, símbolo). Cognito valida su policy en
// AdminSetUserPassword, así que dejamos holgura sobre el mínimo habitual.
// Usa crypto.randomInt (CSPRNG) y luego baraja para no fijar las posiciones.
export function generateTempPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%*?-_'
  const all = upper + lower + digits + symbols

  const pick = (set: string) => set[randomInt(set.length)]
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  while (chars.length < length) {
    chars.push(pick(all))
  }

  // Fisher-Yates con randomInt para no dejar las 4 clases fijas al inicio.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}

export function isCognitoConfigured() {
  return getCognitoEnv() !== null
}

export function getCognitoClient() {
  const env = getCognitoEnv()
  if (!env) {
    return null
  }

  if (!cognitoClient) {
    cognitoClient = new CognitoIdentityProviderClient({
      region: env.region,
    })
  }

  return cognitoClient
}

export async function describeConfiguredUserPool() {
  const env = getCognitoEnv()
  const client = getCognitoClient()

  if (!env || !client) {
    return null
  }

  const result = await client.send(
    new DescribeUserPoolCommand({
      UserPoolId: env.userPoolId,
    }),
  )

  return result.UserPool ?? null
}

export async function adminCreateCognitoUser(input: {
  email: string
  password: string
  fullName: string
  source?: 'primary' | 'business'
}): Promise<{ sub: string; alreadyExisted: boolean }> {
  const env = input.source === 'business' ? getBusinessCognitoEnv() : getCognitoEnv()
  const client = getCognitoClient()

  if (!env || !client) {
    throw new Error('Cognito no esta configurado.')
  }

  const username = input.email.trim().toLowerCase()

  let alreadyExisted = false
  try {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: env.userPoolId,
        Username: username,
        MessageAction: MessageActionType.SUPPRESS,
        UserAttributes: [
          { Name: 'email', Value: username },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: input.fullName },
        ],
      }),
    )
  } catch (error) {
    if (error instanceof UsernameExistsException) {
      alreadyExisted = true
    } else {
      throw error
    }
  }

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: env.userPoolId,
      Username: username,
      Password: input.password,
      Permanent: true,
    }),
  )

  const describe = await client.send(
    new AdminGetUserCommand({
      UserPoolId: env.userPoolId,
      Username: username,
    }),
  )

  const sub = describe.UserAttributes?.find((attr) => attr.Name === 'sub')?.Value
  if (!sub) {
    throw new Error('Cognito no devolvio el sub del usuario.')
  }

  return { sub, alreadyExisted }
}

// Setea una nueva contraseña permanente para un usuario existente. Usado por
// el flujo de magic-link reset y el cambio in-session. Acepta source para
// elegir entre pool primary (Countrify) y business (Citify compartido).
export async function adminSetCognitoPassword(input: {
  email: string
  newPassword: string
  source?: 'primary' | 'business'
}): Promise<void> {
  const env = input.source === 'business' ? getBusinessCognitoEnv() : getCognitoEnv()
  const client = getCognitoClient()

  if (!env || !client) {
    throw new Error('Cognito no esta configurado.')
  }

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: env.userPoolId,
      Username: input.email.trim().toLowerCase(),
      Password: input.newPassword,
      Permanent: true,
    }),
  )
}

export async function signInWithCognitoPassword(email: string, password: string) {
  const env = getCognitoEnv()
  const client = getCognitoClient()

  if (!env || !client) {
    throw new Error('Cognito no esta configurado.')
  }

  return client.send(
    new InitiateAuthCommand({
      ClientId: env.clientId,
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: {
        USERNAME: email.trim().toLowerCase(),
        PASSWORD: password,
      },
    }),
  )
}

export async function signInWithBusinessPool(email: string, password: string) {
  const env = getBusinessCognitoEnv()
  const client = getCognitoClient()

  if (!env || !client) {
    throw new Error('Cognito (business pool) no esta configurado.')
  }

  return client.send(
    new InitiateAuthCommand({
      ClientId: env.clientId,
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: {
        USERNAME: email.trim().toLowerCase(),
        PASSWORD: password,
      },
    }),
  )
}

export async function signInWithCognitoFallback(
  email: string,
  password: string,
): Promise<{ source: CognitoPoolSource }> {
  try {
    await signInWithCognitoPassword(email, password)
    return { source: 'primary' }
  } catch (error: any) {
    const isMissingUser =
      error?.name === 'UserNotFoundException' || error?.name === 'NotAuthorizedException'
    if (!isMissingUser || !getBusinessCognitoEnv()) {
      throw error
    }
    await signInWithBusinessPool(email, password)
    return { source: 'business' }
  }
}
