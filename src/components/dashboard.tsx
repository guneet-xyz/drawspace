'use client'

/* eslint-disable @next/next/no-img-element -- stored canvas PNGs are data URLs */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowUpRight,
  Copy,
  FilePlus2,
  FolderOpen,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Drawing, User, Workspace } from '@/lib/types'
import { api, json } from '@/lib/api-client'
import { canEdit } from '@/lib/permissions'
import { cn, relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { NewDrawingDialog } from '@/components/new-drawing-dialog'
import { WorkspaceDialog } from '@/components/workspace-dialog'
import { IdeaPreview } from '@/components/idea-preview'
import { GuestImport } from '@/components/guest-import'

export function Dashboard({
  user,
  workspace,
  drawings,
  favorites,
}: {
  user: User
  workspace?: Workspace
  drawings: Drawing[]
  favorites: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<'recent' | 'name'>('recent')
  const [newOpen, setNewOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [deleting, setDeleting] = useState<Drawing | null>(null)
  const [renaming, setRenaming] = useState<Drawing | null>(null)
  const [busy, setBusy] = useState(false)
  const editable = workspace && canEdit(workspace.role)
  const filtered = drawings
    .filter(
      (d) =>
        (!favorites || d.favorite) &&
        d.title.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.title.localeCompare(b.title)
        : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
  async function favorite(drawing: Drawing) {
    try {
      await api(`/drawings/${drawing.id}/favorite`, {
        method: 'POST',
        body: json({ favorite: !drawing.favorite }),
      })
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  async function duplicate(drawing: Drawing) {
    try {
      const copy = await api<{ id: string }>(
        `/drawings/${drawing.id}/duplicate`,
        { method: 'POST', body: json({}) },
      )
      toast.success('Drawing duplicated')
      router.push(`/app/drawings/${copy.id}`)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  async function rename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!renaming) return
    setBusy(true)
    const title = new FormData(event.currentTarget).get('title')
    try {
      await api(`/drawings/${renaming.id}`, {
        method: 'PATCH',
        body: json({ title, version: renaming.version }),
      })
      setRenaming(null)
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function menu(drawing: Drawing) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label={`Options for ${drawing.title}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => favorite(drawing)}>
            <Star />
            {drawing.favorite ? 'Remove from favorites' : 'Add to favorites'}
          </DropdownMenuItem>
          {editable && (
            <>
              <DropdownMenuItem onSelect={() => setRenaming(drawing)}>
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => duplicate(drawing)}>
                <Copy />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDeleting(drawing)}
              >
                <Trash2 />
                Delete drawing
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-9 sm:py-10">
      {!favorites && editable && workspace && (
        <GuestImport workspaceId={workspace.id} />
      )}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="mb-2 text-[12px] text-muted-foreground">
            {favorites
              ? 'Keep the good ones close'
              : `Hello, ${user.name.split(' ')[0]} ✨`}
          </p>
          <h1 className="text-[27px] font-semibold tracking-[-0.04em]">
            {favorites ? 'Your favorites' : 'Your ideas live here'}
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {favorites
              ? 'A little collection of drawings you love.'
              : 'A sketch, a plan, a spark of something. Make room for it.'}
          </p>
        </div>
        {editable && (
          <Button onClick={() => setNewOpen(true)}>
            <Plus />
            New drawing
          </Button>
        )}
      </div>
      {!favorites && editable && (
        <section className="relative mb-9 flex overflow-hidden rounded-2xl border border-[#e9e4f4] bg-[#f6f4fc] p-6 sm:p-7">
          <div className="relative z-10">
            <span className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-primary uppercase">
              <Sparkles className="size-3" />A little inspiration
            </span>
            <h2 className="text-lg font-semibold tracking-tight">
              Big ideas start with small scribbles.
            </h2>
            <p className="mt-2 max-w-sm text-xs leading-5 text-[#8a83a1]">
              Don’t wait for the perfect idea. Start with a shape, a line,
              <br className="hidden sm:block" /> or a thought — and see where it
              takes you.
            </p>
            <button
              onClick={() => setNewOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary"
            >
              Let’s make something <ArrowUpRight className="size-3.5" />
            </button>
          </div>
          <IdeaPreview className="absolute right-5 top-0 hidden h-full w-[330px] opacity-80 xl:block" />
        </section>
      )}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">
            {favorites ? 'Favorite drawings' : 'All drawings'}
          </h2>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-40 sm:w-52">
            <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              aria-label="Search drawings"
              placeholder="Search drawings..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 pl-9 text-xs shadow-none"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                aria-label="Sort drawings"
              >
                <ArrowDownWideNarrow className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setSort('recent')}>
                Recently updated {sort === 'recent' && '✓'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSort('name')}>
                Name A–Z {sort === 'name' && '✓'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex rounded-lg border p-0.5">
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                'size-7',
                view === 'grid' && 'bg-muted text-primary',
              )}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
            >
              <LayoutGrid className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                'size-7',
                view === 'list' && 'bg-muted text-primary',
              )}
              aria-label="List view"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <List className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
      {!workspace ? (
        <div className="rounded-2xl border border-dashed py-20 text-center">
          <FolderOpen className="mx-auto mb-4 size-9 text-primary/60" />
          <h2 className="font-medium">Your next chapter starts here</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a workspace to give your ideas a home.
          </p>
          <Button className="mt-5" onClick={() => setWorkspaceOpen(true)}>
            <Plus />
            Create workspace
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-[#fcfbfe] px-6 py-12 text-center">
          <IdeaPreview kind="blank" className="mx-auto h-36 w-60" />
          <h2 className="text-base font-medium">
            {search
              ? 'No drawings found'
              : favorites
                ? 'Your favorites are waiting'
                : 'A fresh space, full of possibility'}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            {search
              ? 'Try a different search or clear the filter.'
              : favorites
                ? 'Star any drawing to keep it close. Your favorites will appear here.'
                : editable
                  ? 'Every great idea starts somewhere. Create your first drawing and make your mark.'
                  : 'Drawings will appear here when your team creates them.'}
          </p>
          {!search && !favorites && editable && (
            <Button className="mt-5" onClick={() => setNewOpen(true)}>
              <Plus />
              Create your first drawing
            </Button>
          )}
          {search && (
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => setSearch('')}
            >
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div
          className={
            view === 'grid'
              ? 'grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
              : 'overflow-hidden rounded-xl border bg-white'
          }
        >
          {filtered.map((drawing) =>
            view === 'grid' ? (
              <article
                key={drawing.id}
                className="group overflow-hidden rounded-xl border bg-white transition-all hover:border-[#d4cdeb] hover:shadow-[0_5px_20px_-7px_#766a9a25]"
              >
                <div className="relative">
                  <Link
                    href={`/app/drawings/${drawing.id}`}
                    className="block h-44 overflow-hidden border-b bg-[#fcfbfe]"
                    aria-label={`Open ${drawing.title}`}
                  >
                    {drawing.thumbnail ? (
                      <img
                        src={drawing.thumbnail}
                        alt=""
                        className="size-full object-contain p-4 transition-transform group-hover:scale-[1.03]"
                      />
                    ) : (
                      <IdeaPreview kind="blank" className="size-full" />
                    )}
                  </Link>
                  <button
                    onClick={() => favorite(drawing)}
                    aria-label={
                      drawing.favorite
                        ? 'Remove from favorites'
                        : 'Add to favorites'
                    }
                    className={cn(
                      'absolute right-3 top-3 rounded-md border bg-white/90 p-1.5 shadow-xs transition-opacity focus:opacity-100',
                      drawing.favorite
                        ? 'text-[#d8a74a]'
                        : 'text-muted-foreground opacity-0 group-hover:opacity-100',
                    )}
                  >
                    <Star
                      className={cn(
                        'size-3.5',
                        drawing.favorite && 'fill-current',
                      )}
                    />
                  </button>
                </div>
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/app/drawings/${drawing.id}`}
                      className="truncate text-[13px] font-medium hover:text-primary"
                    >
                      {drawing.title}
                    </Link>
                    {menu(drawing)}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>Edited {relativeTime(drawing.updated_at)}</span>
                    <span>·</span>
                    <span className="truncate">
                      {drawing.creator_name ?? 'Workspace member'}
                    </span>
                  </p>
                </div>
              </article>
            ) : (
              <article
                key={drawing.id}
                className="flex items-center gap-4 border-b px-4 py-3 last:border-0 hover:bg-muted/50"
              >
                <Link
                  href={`/app/drawings/${drawing.id}`}
                  className="flex min-w-0 flex-1 items-center gap-4"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <FilePlus2 className="size-4 text-primary" />
                  </span>
                  <span className="truncate text-sm font-medium">
                    {drawing.title}
                  </span>
                </Link>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {relativeTime(drawing.updated_at)}
                </span>
                <button
                  aria-label={
                    drawing.favorite
                      ? 'Remove from favorites'
                      : 'Add to favorites'
                  }
                  onClick={() => favorite(drawing)}
                  className="rounded p-2"
                >
                  <Star
                    className={cn(
                      'size-4 text-muted-foreground',
                      drawing.favorite && 'fill-[#d8a74a] text-[#d8a74a]',
                    )}
                  />
                </button>
                {menu(drawing)}
              </article>
            ),
          )}
        </div>
      )}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[#b5abd7]" />
          Made for a little more imagination.
        </span>
        {workspace && (
          <Link
            href={`/app/workspaces/${workspace.id}/members`}
            className="flex items-center gap-1.5 hover:text-primary"
          >
            <Users className="size-3.5" />
            {workspace.member_count}{' '}
            {workspace.member_count === 1 ? 'person' : 'people'} in this space{' '}
            <ArrowUpRight className="size-3" />
          </Link>
        )}
      </div>
      {workspace && (
        <NewDrawingDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          workspaceId={workspace.id}
        />
      )}
      <WorkspaceDialog open={workspaceOpen} onOpenChange={setWorkspaceOpen} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this drawing?"
        description={`“${deleting?.title}” and its share links will be permanently deleted. This cannot be undone.`}
        onConfirm={async () => {
          if (deleting) {
            await api(`/drawings/${deleting.id}`, { method: 'DELETE' })
            router.refresh()
            toast.success('Drawing deleted')
          }
        }}
      />
      <Dialog
        open={!!renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename drawing</DialogTitle>
            <DialogDescription>
              A good name makes your ideas easier to find.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={rename} className="space-y-5">
            <Input
              name="title"
              aria-label="Drawing name"
              defaultValue={renaming?.title}
              required
              maxLength={160}
              autoFocus
            />
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setRenaming(null)}
              >
                Cancel
              </Button>
              <Button disabled={busy}>Save name</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}
