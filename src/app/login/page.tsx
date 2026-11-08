import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { AuthForm } from '@/components/auth-form'
import { discordEnabled } from '@/lib/discord'
import { discordErrorMessage } from '@/lib/discord-messages'
import { mailEnabled } from '@/lib/mail'

export const metadata = { title: 'Sign in' }
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ discord_error?: string; discord_email?: string }>
}) {
  if (await getUser()) redirect('/app')
  const params = await searchParams
  return (
    <AuthForm
      mode="login"
      discordEnabled={discordEnabled()}
      emailEnabled={mailEnabled()}
      discordError={discordErrorMessage(params.discord_error)}
      notice={
        params.discord_email === 'sent'
          ? 'Check your email. We sent a link to connect Discord to your existing account.'
          : undefined
      }
    />
  )
}
