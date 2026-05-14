import {
  AuthFlowType,
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider'

type CognitoEnv = {
  region: string
  userPoolId: string
  clientId: string
}

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
