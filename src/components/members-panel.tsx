'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LockKeyhole, Plus, Shield, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { Member, Role, User, Workspace } from '@/lib/types'
import { canManage, canManageMember } from '@/lib/permissions'
import { api, json } from '@/lib/api-client'
import { initials } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/confirm-dialog'

export function MembersPanel({
  workspace,
  members,
  user,
}: {
  workspace: Workspace
  members: Member[]
  user: User
}) {
  const router = useRouter()
  const [role, setRole] = useState<Role>('editor')
  const [busy, setBusy] = useState(false)
  const [deleteWorkspace, setDeleteWorkspace] = useState(false)
  const [removing, setRemoving] = useState<Member | null>(null)
  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const form = event.currentTarget
    const email = new FormData(form).get('email')
    try {
      await api(`/workspaces/${workspace.id}/members`, {
        method: 'POST',
        body: json({ email, role }),
      })
      form.reset()
      router.refresh()
      toast.success('Member added to your workspace')
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function changeRole(member: Member, role: string) {
    try {
      await api(`/workspaces/${workspace.id}/members/${member.id}`, {
        method: 'PATCH',
        body: json({ role }),
      })
      router.refresh()
      toast.success('Role updated')
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  async function rename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const name = new FormData(event.currentTarget).get('name')
    try {
      await api(`/workspaces/${workspace.id}`, {
        method: 'PATCH',
        body: json({ name }),
      })
      router.refresh()
      toast.success('Workspace name updated')
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-9">
      <h1 className="text-2xl font-semibold tracking-tight">
        A space for your people
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage {workspace.name}, its members, and who can do what.
      </p>
      <section className="mt-8 rounded-2xl border bg-white p-6">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-primary" />
          Workspace members
        </h2>
        <p className="mb-6 text-xs text-muted-foreground">
          Everyone in this workspace can see its drawings.
        </p>
        {canManage(workspace.role) && (
          <form onSubmit={add} className="mb-6 rounded-xl bg-muted p-4">
            <label htmlFor="member-email" className="text-xs font-medium">
              Add an existing user
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <Input
                id="member-email"
                name="email"
                type="email"
                placeholder="teammate@example.com"
                required
                className="min-w-40 flex-1"
                maxLength={254}
              />
              <Select
                value={role}
                onValueChange={(value) => setRole(value as Role)}
              >
                <SelectTrigger aria-label="New member role" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workspace.role === 'owner' && (
                    <SelectItem value="admin">Admin</SelectItem>
                  )}
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Plus />}Add
                member
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              Ask your teammate to create an account on this instance first,
              then add their email here.
            </p>
          </form>
        )}
        <div className="divide-y">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-primary">
                {initials(member.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}{' '}
                  {member.id === user.id && (
                    <span className="text-xs font-normal text-muted-foreground">
                      (you)
                    </span>
                  )}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {member.email}
                </p>
              </div>
              {canManageMember(workspace.role, member.role) ? (
                <>
                  <Select
                    value={member.role}
                    onValueChange={(value) => changeRole(member, value)}
                  >
                    <SelectTrigger
                      className="h-8 w-25 text-xs"
                      aria-label={`Role for ${member.name}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {workspace.role === 'owner' && (
                        <SelectItem value="admin">Admin</SelectItem>
                      )}
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${member.name}`}
                    onClick={() => setRemoving(member)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              ) : (
                <Badge className="mr-1">
                  {member.role === 'owner' && <Shield className="size-3" />}
                  {member.role}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="mt-6 rounded-2xl border bg-white p-6">
        <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold">
          <LockKeyhole className="size-4 text-primary" />A role for everyone
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {[
            {
              name: 'Owner',
              text: 'Full access, including managing admins and permanently deleting the workspace.',
            },
            {
              name: 'Admin',
              text: 'Manage workspace settings, editors, viewers, drawings, and share links.',
            },
            {
              name: 'Editor',
              text: 'Create, edit, duplicate, and delete drawings. Create and revoke share links.',
            },
            {
              name: 'Viewer',
              text: 'View drawings, download exports, and keep a personal list of favorites.',
            },
          ].map(({ name, text }) => (
            <div key={name}>
              <p className="text-xs font-semibold">{name}</p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>
      {canManage(workspace.role) && (
        <section className="mt-6 rounded-2xl border bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold">Workspace details</h2>
          <form onSubmit={rename}>
            <label
              htmlFor="rename-workspace"
              className="text-xs text-muted-foreground"
            >
              Workspace name
            </label>
            <div className="mt-2 flex gap-3">
              <Input
                key={workspace.name}
                id="rename-workspace"
                name="name"
                defaultValue={workspace.name}
                maxLength={80}
                required
              />
              <Button variant="outline" disabled={busy}>
                Save name
              </Button>
            </div>
          </form>
        </section>
      )}
      {workspace.role === 'owner' && (
        <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-100 bg-red-50/30 p-6">
          <div>
            <h2 className="text-sm font-semibold">Delete workspace</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Permanently delete all drawings, memberships, and share links.
            </p>
          </div>
          <Button
            variant="outline"
            className="border-red-200 text-destructive hover:bg-red-50 hover:text-destructive"
            onClick={() => setDeleteWorkspace(true)}
          >
            Delete workspace
          </Button>
        </section>
      )}
      <ConfirmDialog
        open={deleteWorkspace}
        onOpenChange={setDeleteWorkspace}
        title={`Delete ${workspace.name}?`}
        description="Every drawing and share link in this workspace will be permanently deleted for everyone. This cannot be undone."
        label="Delete workspace"
        onConfirm={async () => {
          await api(`/workspaces/${workspace.id}`, { method: 'DELETE' })
          router.push('/app')
          router.refresh()
          toast.success('Workspace deleted')
        }}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={`Remove ${removing?.name}?`}
        description="They will lose access to this workspace and its drawings. You can add them back later."
        label="Remove member"
        onConfirm={async () => {
          if (removing) {
            await api(`/workspaces/${workspace.id}/members/${removing.id}`, {
              method: 'DELETE',
            })
            router.refresh()
            toast.success('Member removed')
          }
        }}
      />
    </main>
  )
}
