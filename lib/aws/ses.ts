import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1'
const SES_FROM_ADDRESS = process.env.SES_FROM_ADDRESS ?? 'noreply@countrify.com.ar'

let cachedClient: SESv2Client | null = null

function getSesClient() {
  if (!cachedClient) {
    cachedClient = new SESv2Client({ region: AWS_REGION })
  }
  return cachedClient
}

export interface SendContactEmailInput {
  to: string
  subject: string
  bodyText: string
  bodyHtml: string
  replyTo?: string
}

export async function sendEmail({ to, subject, bodyText, bodyHtml, replyTo }: SendContactEmailInput) {
  const command = new SendEmailCommand({
    FromEmailAddress: SES_FROM_ADDRESS,
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: bodyText, Charset: 'UTF-8' },
          Html: { Data: bodyHtml, Charset: 'UTF-8' },
        },
      },
    },
  })

  const result = await getSesClient().send(command)
  return result.MessageId
}
