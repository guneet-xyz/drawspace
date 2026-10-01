import { requireUser } from '@/lib/auth'
import { getDrawings, getWorkspaces } from '@/lib/data'
import { AppShell } from '@/components/app-shell'
import { Dashboard } from '@/components/dashboard'

export const metadata = { title: 'Your drawings' }
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; filter?: string }>
}) {
  const user = await requireUser()
  const params = await searchParams
  const workspaces = await getWorkspaces(user.id)
  const workspace = workspaces.find((w) => w.id === params.w) ?? workspaces[0]
  const drawings = workspace ? await getDrawings(workspace.id, user.id) : []
  const favorites = params.filter === 'favorites'
  return (
    <AppShell
      user={user}
      workspaces={JSON.parse(JSON.stringify(workspaces))}
      workspace={workspace}
      favorites={favorites}
    >
      <Dashboard
        user={user}
        workspace={workspace}
        drawings={JSON.parse(JSON.stringify(drawings))}
        favorites={favorites}
      />
    </AppShell>
  )
}
