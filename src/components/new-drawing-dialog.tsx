'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { api, json } from '@/lib/api-client'
import { makeTemplate } from '@/lib/templates'
import { cn } from '@/lib/utils'
import { IdeaPreview } from '@/components/idea-preview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function NewDrawingDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
}) {
  const [kind, setKind] = useState<'blank' | 'flow' | 'notes'>('blank')
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const title = new FormData(event.currentTarget).get('title')
    try {
      const scene = await makeTemplate(kind)
      const drawing = await api<{ id: string }>('/drawings', {
        method: 'POST',
        body: json({ workspaceId, title, scene }),
      })
      router.push(`/app/drawings/${drawing.id}`)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start something new</DialogTitle>
          <DialogDescription>
            A blank page or a little head start. Where will your ideas take you?
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="drawing-title" className="text-sm font-medium">
              Drawing name
            </label>
            <Input
              id="drawing-title"
              name="title"
              placeholder="e.g. My next big idea"
              defaultValue="Untitled drawing"
              required
              maxLength={160}
              autoFocus
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Start with</p>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { key: 'blank', label: 'Blank canvas' },
                  { key: 'flow', label: 'Simple flow' },
                  { key: 'notes', label: 'Brainstorm' },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setKind(key)}
                  aria-pressed={kind === key}
                  className={cn(
                    'relative overflow-hidden rounded-xl border text-left transition-colors',
                    kind === key
                      ? 'border-primary bg-secondary/40 ring-1 ring-primary'
                      : 'hover:bg-muted',
                  )}
                >
                  <IdeaPreview kind={key} className="h-22 w-full" />
                  <span className="block border-t px-2.5 py-2 text-[11px]">
                    {label}
                  </span>
                  {kind === key && (
                    <Check className="absolute right-2 top-2 size-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}Create drawing
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
