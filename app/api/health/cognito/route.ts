import { NextResponse } from 'next/server'
import { describeConfiguredUserPool, getCognitoEnv, isCognitoConfigured } from '@/lib/aws/cognito'

export async function GET() {
  if (!isCognitoConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: 'AWS_COGNITO_* no esta configurado todavia.',
    })
  }

  try {
    const env = getCognitoEnv()!
    const userPool = await describeConfiguredUserPool()

    return NextResponse.json({
      ok: true,
      configured: true,
      region: env.region,
      userPoolId: env.userPoolId,
      clientId: env.clientId,
      poolName: userPool?.Name ?? null,
      status: userPool?.Status ?? null,
      now: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: error instanceof Error ? error.message : 'No se pudo consultar Cognito.',
      },
      { status: 500 },
    )
  }
}
