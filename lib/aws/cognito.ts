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

export async function adminCreateCognitoUser(input: {
  email: string
  password: string
  fullName: string
}): Promise<{ sub: string; alreadyExisted: boolean }> {
  const env = getCognitoEnv()
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
