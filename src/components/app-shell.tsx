'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  FolderOpen,
  LayoutGrid,
  LogOut,
  Menu,
  PencilLine,
  Plus,
  Settings,
  Star,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import type { User, Workspace } from '@/lib/types'
import { api, json } from '@/lib/api-client'
import { cn, initials } from '@/lib/utils'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { WorkspaceDialog } from '@/components/workspace-dialog'

export function AppShell({
  user,
  workspaces,
  workspace,
  favorites = false,
  children,
}: {
  user: User
  workspaces: Workspace[]
  workspace?: Workspace
  favorites?: boolean
  children: React.ReactNode
}) {
  const path = usePathname()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const base = workspace ? `/app?w=${workspace.id}` : '/app'
  const nav = [
    {
      label: 'All drawings',
      icon: LayoutGrid,
      href: base,
      active: path === '/app' && !favorites,
    },
    {
      label: 'Favorites',
      icon: Star,
      href: `${base}${base.includes('?') ? '&' : '?'}filter=favorites`,
      active: path === '/app' && favorites,
    },
    ...(workspace
      ? [
          {
            label: 'Members & settings',
            icon: Users,
            href: `/app/workspaces/${workspace.id}/members`,
            active: path.includes('/members'),
          },
        ]
      : []),
  ]
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: json({}) })
      router.push('/')
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  function sidebar() {
    return (
      <div className="flex h-full flex-col p-5">
        <Logo href="/app" className="mb-8 ml-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="mb-7 flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-xs">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#eeebfa] text-sm font-semibold text-primary">
                {workspace ? (
                  initials(workspace.name)
                ) : (
                  <FolderOpen className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">
                  {workspace?.name ?? 'Choose a workspace'}
                </span>
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  {workspace
                    ? `${workspace.member_count} ${workspace.member_count === 1 ? 'member' : 'members'} · ${workspace.role}`
                    : 'Create your first space'}
                </span>
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            {workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onSelect={() => {
                  router.push(`/app?w=${w.id}`)
                  setMobileOpen(false)
                }}
              >
                <FolderOpen />
                <span className="flex-1 truncate">{w.name}</span>
                {w.id === workspace?.id && <Check className="text-primary" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
              <Plus />
              Create workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Workspace
        </p>
        <nav className="space-y-1">
          {nav.map(({ label, icon: Icon, href, active }) => (
            <Link
              key={label}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                active && 'bg-[#eeebfa] font-medium text-primary',
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between px-3">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Your spaces
            </p>
            <button
              aria-label="Create workspace"
              className="rounded p-0.5 text-muted-foreground hover:bg-accent"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {workspaces.map((w, i) => (
              <Link
                key={w.id}
                href={`/app?w=${w.id}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent"
              >
                <span
                  className={cn(
                    'size-2 rounded-[3px]',
                    ['bg-[#a699dc]', 'bg-[#7cb6a4]', 'bg-[#dfb374]'][i % 3],
                  )}
                />
                <span className="truncate">{w.name}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-auto pt-10">
          <div className="mb-5 rounded-xl border border-[#e9e4f4] bg-[#f3f0fa] p-4">
            <PencilLine className="mb-2 size-4 text-primary" />
            <p className="text-xs font-medium">Just want to doodle?</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              A little room to think, no strings attached.
            </p>
            <Link
              href="/guest"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-primary"
            >
              Open guest canvas <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e8e4f3] text-[11px] font-semibold text-[#776797]">
                  {initials(user.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {user.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {user.email}
                  </span>
                </span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onSelect={() => router.push('/app/settings')}>
                <Settings />
                Account settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={logout}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }
  return (
    <div className="flex min-h-dvh bg-[#fdfdfd]">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r bg-[#fafafa] lg:block">
        {sidebar()}
      </aside>
      <div className="min-w-0 flex-1 lg:ml-60">
        <header className="flex h-17 items-center justify-between gap-4 border-b bg-white px-5 sm:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </Button>
            <span className="text-xs text-muted-foreground">Workspace</span>
            <span className="text-xs text-border">/</span>
            <span className="truncate text-xs font-medium">
              {workspace?.name ?? 'Account'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Your own creative corner
            </span>
            {workspace && (
              <Badge className="hidden sm:inline-flex">{workspace.role}</Badge>
            )}
          </div>
        </header>
        {children}
      </div>
      <WorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="inset-y-0 left-0 top-0 h-dvh w-72 max-w-none translate-x-0 translate-y-0 rounded-none p-0">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Workspaces and account navigation
          </DialogDescription>
          {sidebar()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
