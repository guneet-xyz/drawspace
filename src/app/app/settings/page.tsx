import { requireUser } from '@/lib/auth'
import { getWorkspaces } from '@/lib/data'
import { AppShell } from '@/components/app-shell'
import { AccountSettings } from '@/components/account-settings'
import { sql } from '@/lib/db'
import { discordEnabled } from '@/lib/discord'
import { discordErrorMessage } from '@/lib/discord-messages'
import { mailEnabled } from '@/lib/mail'

export const metadata = { title: 'Account settings' }
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ discord_error?: string; discord_connected?: string }>
}) {
  const user = await requireUser()
  const workspaces = await getWorkspaces(user.id)
  const [account] = await sql`
    SELECT password_hash IS NOT NULL AS has_password, discord_id IS NOT NULL AS discord_connected
    FROM users WHERE id = ${user.id}
  `
  const params = await searchParams
  return (
    <AppShell user={user} workspaces={JSON.parse(JSON.stringify(workspaces))}>
      <AccountSettings
        user={user}
        hasPassword={account.has_password}
        discordEnabled={discordEnabled()}
        discordConnected={account.discord_connected}
        emailEnabled={mailEnabled()}
        discordError={discordErrorMessage(params.discord_error)}
      />
    </AppShell>
  )
}
