'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import type { EditorProps } from '@/components/canvas-editor'

const CanvasEditor = dynamic(() => import('@/components/canvas-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#faf9fd]">
      <Loader2 className="size-7 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        Making room for your ideas…
      </p>
    </div>
  ),
})

export function EditorLoader(props: EditorProps) {
  return <CanvasEditor {...props} />
}
