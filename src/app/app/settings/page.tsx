import { requireUser } from '@/lib/auth'
import { getWorkspaces } from '@/lib/data'
import { AppShell } from '@/components/app-shell'
import { AccountSettings } from '@/components/account-settings'

export const metadata = { title: 'Account settings' }
export default async function SettingsPage() {
  const user = await requireUser()
  const workspaces = await getWorkspaces(user.id)
  return (
    <AppShell user={user} workspaces={JSON.parse(JSON.stringify(workspaces))}>
      <AccountSettings user={user} />
    </AppShell>
  )
}
