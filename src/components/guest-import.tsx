'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { HardDrive, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, json } from '@/lib/api-client'
import { sceneSchema } from '@/lib/validation'
import { Button } from '@/components/ui/button'

const subscribe = () => () => {}
const getServerSnapshot = () => null
const getSnapshot = () => {
  try {
    return localStorage.getItem('drawspace:guest')
  } catch {
    return null
  }
}

export function GuestImport({ workspaceId }: { workspaceId: string }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  if (!raw || dismissed) return null
  async function save() {
    setBusy(true)
    try {
      const local = JSON.parse(raw!)
      const scene = sceneSchema.parse(local.scene)
      const drawing = await api<{ id: string }>('/drawings', {
        method: 'POST',
        body: json({
          workspaceId,
          title: local.title || 'My guest sketch',
          scene,
        }),
      })
      toast.success('Your guest sketch has a new home')
      router.push(`/app/drawings/${drawing.id}`)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[#ddd7f2] bg-secondary/40 p-4">
      <HardDrive className="size-4 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">Your guest sketch is still here</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Save a copy in this workspace to access it on any device.
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
        Not now
      </Button>
      <Button size="sm" onClick={save} disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}Save guest sketch
      </Button>
    </div>
  )
}
