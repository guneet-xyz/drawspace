import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { AuthForm } from '@/components/auth-form'
import { discordEnabled } from '@/lib/discord'
import { discordErrorMessage } from '@/lib/discord-messages'

export const metadata = { title: 'Sign in' }
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ discord_error?: string }>
}) {
  if (await getUser()) redirect('/app')
  const params = await searchParams
  return (
    <AuthForm
      mode="login"
      discordEnabled={discordEnabled()}
      discordError={discordErrorMessage(params.discord_error)}
    />
  )
}
