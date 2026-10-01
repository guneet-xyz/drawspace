import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getMembers, getWorkspaces } from '@/lib/data'
import { AppShell } from '@/components/app-shell'
import { MembersPanel } from '@/components/members-panel'

export const metadata = { title: 'Members & settings' }
export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params
  const workspaces = await getWorkspaces(user.id)
  const workspace = workspaces.find((w) => w.id === id)
  if (!workspace) notFound()
  const members = await getMembers(id)
  return (
    <AppShell
      user={user}
      workspaces={JSON.parse(JSON.stringify(workspaces))}
      workspace={workspace}
    >
      <MembersPanel
        user={user}
        workspace={workspace}
        members={JSON.parse(JSON.stringify(members))}
      />
    </AppShell>
  )
}
