'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Check,
  Copy,
  Link2,
  Loader2,
  LockKeyhole,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Share } from '@/lib/types'
import { api, json } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function ShareDialog({
  open,
  onOpenChange,
  drawingId,
  workspaceId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  drawingId: string
  workspaceId: string
}) {
  const [shares, setShares] = useState<Share[]>([])
  const [url, setUrl] = useState('')
  const [expiry, setExpiry] = useState('7')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!open) return
    let active = true
    api<Share[]>(`/drawings/${drawingId}/shares`)
      .then((data) => {
        if (active) setShares(data)
      })
      .catch((error) => toast.error(error.message))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, drawingId])
  async function create() {
    setBusy(true)
    try {
      const share = await api<Share & { url: string }>(
        `/drawings/${drawingId}/shares`,
        {
          method: 'POST',
          body: json({
            expiresInDays: expiry === 'never' ? null : Number(expiry),
          }),
        },
      )
      setShares((value) => [share, ...value])
      setUrl(share.url)
      setCopied(false)
      toast.success('Share link created')
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.')
    }
  }
  async function revoke(id: string) {
    try {
      await api(`/drawings/${drawingId}/shares/${id}`, { method: 'DELETE' })
      setShares((value) => value.filter((s) => s.id !== id))
      setUrl('')
      toast.success('Share link revoked')
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Good ideas are worth sharing</DialogTitle>
          <DialogDescription>
            Everyone in your workspace already has access. Create a link to let
            someone else take a look.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border bg-muted/50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="size-4 text-primary" />
            Read-only share link
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Anyone with the link can view and download this drawing, without an
            account. Changes appear after they reload. It does not grant
            workspace access.
          </p>
          <div className="mt-4 flex gap-2">
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger aria-label="Share link expiry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Expires in 7 days</SelectItem>
                <SelectItem value="30">Expires in 30 days</SelectItem>
                <SelectItem value="never">Never expires</SelectItem>
              </SelectContent>
            </Select>
            <Button disabled={busy} onClick={create}>
              {busy && <Loader2 className="animate-spin" />}Create link
            </Button>
          </div>
          {url && (
            <div className="mt-3">
              <div className="flex gap-2">
                <Input
                  value={url}
                  readOnly
                  aria-label="Share URL"
                  onFocus={(event) => event.target.select()}
                  className="text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copy share link"
                  onClick={copy}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Copy this link now. For security, existing link tokens cannot be
                retrieved later.
              </p>
            </div>
          )}
        </div>
        <div>
          <p className="mb-3 text-xs font-medium">
            Active links ({shares.length})
          </p>
          {loading ? (
            <Loader2 className="mx-auto my-4 size-4 animate-spin text-muted-foreground" />
          ) : shares.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              No public links. This drawing is private to your workspace.
            </p>
          ) : (
            <div className="max-h-45 space-y-2 overflow-y-auto">
              {shares.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                >
                  <LockKeyhole className="size-3.5 text-muted-foreground" />
                  <div className="flex-1 text-[11px]">
                    <p>
                      Created {new Date(share.created_at).toLocaleDateString()}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {share.expires_at
                        ? `Expires ${new Date(share.expires_at).toLocaleDateString()}`
                        : 'No expiration'}{' '}
                      · View only
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    aria-label="Revoke share link"
                    onClick={() => revoke(share.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <Link
          href={`/app/workspaces/${workspaceId}/members`}
          className="flex items-center gap-2 border-t pt-4 text-xs font-medium text-primary"
        >
          <Users className="size-3.5" />
          Want them to edit? Add them to your workspace.
        </Link>
      </DialogContent>
    </Dialog>
  )
}
