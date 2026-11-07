import 'server-only'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

export function mailEnabled() {
  return Boolean(
    process.env.EMAIL_FROM &&
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY,
  )
}

let client: SESv2Client | undefined

export async function sendEmail(message: {
  to: string
  subject: string
  text: string
}) {
  if (!mailEnabled()) throw new Error('Email delivery is not configured.')
  client ??= new SESv2Client({ region: process.env.AWS_REGION, maxAttempts: 3 })
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: process.env.EMAIL_FROM,
      Destination: { ToAddresses: [message.to] },
      ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined,
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: message.text, Charset: 'UTF-8' } },
        },
      },
    }),
    { abortSignal: AbortSignal.timeout(15000) },
  )
}
