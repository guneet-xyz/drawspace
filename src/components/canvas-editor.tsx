'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  restore,
  serializeAsJSON,
} from '@excalidraw/excalidraw'
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  ArrowLeft,
  ChevronDown,
  Cloud,
  Download,
  Eye,
  HardDrive,
  Loader2,
  LogIn,
  Share2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, api, json } from '@/lib/api-client'
import type { Scene } from '@/lib/types'
import { sceneSchema } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Logo } from '@/components/logo'
import { ShareDialog } from '@/components/share-dialog'
import '@excalidraw/excalidraw/index.css'

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH: string
  }
}
if (typeof window !== 'undefined')
  window.EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/'

export type EditorProps = {
  mode: 'saved' | 'guest' | 'shared'
  drawingId?: string
  workspaceId?: string
  workspaceName?: string
  title?: string
  scene?: Scene
  version?: number
  readOnly?: boolean
}
type Status = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict'
type LocalDrawing = { scene: Scene; title: string; version: number }
const EMPTY_SCENE: Scene = {
  elements: [],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {},
}

function readLocal(key: string): LocalDrawing | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw)
    const parsed = sceneSchema.safeParse(data.scene)
    if (!parsed.success || typeof data.title !== 'string') return null
    return {
      scene: parsed.data,
      title: data.title,
      version: Number(data.version) || 1,
    }
  } catch {
    return null
  }
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function CanvasEditor(props: EditorProps) {
  const {
    mode,
    drawingId,
    workspaceId,
    workspaceName,
    readOnly = false,
  } = props
  const router = useRouter()
  const key =
    mode === 'guest' ? 'drawspace:guest' : `drawspace:recovery:${drawingId}`
  const [initial] = useState(() => {
    const local = mode !== 'shared' && !readOnly ? readLocal(key) : null
    const compatible = mode === 'guest' || local?.version === props.version
    const stale = mode === 'saved' && local && !compatible ? local : null
    // Keep an incompatible recovery separate before new edits replace the draft.
    if (stale) {
      try {
        localStorage.setItem(`${key}:stale`, json(stale))
      } catch {
        /* optional recovery storage */
      }
    }
    return {
      scene: (compatible && local?.scene) || props.scene || EMPTY_SCENE,
      title: (compatible && local?.title) || props.title || 'Untitled sketch',
      recovered: mode === 'saved' && local && compatible,
      staleRecovery:
        stale ||
        (mode === 'saved' && !readOnly ? readLocal(`${key}:stale`) : null),
    }
  })
  const [initialData] = useState(() => ({
    ...restore(initial.scene as ExcalidrawInitialDataState, null, null),
    scrollToContent: true,
  }))
  const [title, setTitle] = useState(initial.title)
  const [status, setStatus] = useState<Status>(
    initial.recovered ? 'unsaved' : 'saved',
  )
  const [message, setMessage] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [guestNotice, setGuestNotice] = useState(mode === 'guest')
  const [staleRecovery, setStaleRecovery] = useState(initial.staleRecovery)
  const [exporting, setExporting] = useState(false)
  const canvas = useRef<ExcalidrawImperativeAPI | null>(null)
  const latest = useRef({ scene: initial.scene, title: initial.title })
  const currentVersion = useRef(props.version ?? 1)
  const revision = useRef(initial.recovered ? 1 : 0)
  const savedRevision = useRef(0)
  const saving = useRef(false)
  const blocked = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastScene = useRef<string | null>(null)
  const flush = useRef<() => Promise<void>>(async () => {})
  const mounted = useRef(true)

  const storeRecovery = useCallback(() => {
    try {
      localStorage.setItem(
        key,
        json({ ...latest.current, version: currentVersion.current }),
      )
    } catch {
      if (mode === 'guest')
        throw new Error(
          'Browser storage is full or unavailable. Download your drawing to keep it safe.',
        )
    }
  }, [key, mode])

  const save = useCallback(async () => {
    if (
      readOnly ||
      mode === 'shared' ||
      saving.current ||
      blocked.current ||
      revision.current === savedRevision.current
    )
      return
    if (timer.current) clearTimeout(timer.current)
    const capturedRevision = revision.current
    const snapshot = { ...latest.current }
    if (!snapshot.title.trim()) snapshot.title = 'Untitled drawing'
    saving.current = true
    if (mounted.current) setStatus('saving')
    try {
      if (mode === 'guest') storeRecovery()
      else {
        let thumbnail: string | null = null
        const editor = canvas.current
        if (editor && editor.getSceneElements().length) {
          try {
            const blob = await exportToBlob({
              elements: editor.getSceneElements(),
              appState: { ...editor.getAppState(), exportBackground: true },
              files: editor.getFiles(),
              maxWidthOrHeight: 480,
            })
            thumbnail = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = reject
              reader.readAsDataURL(blob)
            })
            if (thumbnail.length > 300000) thumbnail = null
          } catch {
            /* A failed preview must not prevent saving the actual drawing. */
          }
        }
        const result = await api<{ version: number }>(
          `/drawings/${drawingId}`,
          {
            method: 'PATCH',
            body: json({
              ...snapshot,
              version: currentVersion.current,
              thumbnail,
            }),
          },
        )
        currentVersion.current = result.version
      }
      savedRevision.current = capturedRevision
      if (revision.current === capturedRevision) {
        if (mode === 'saved') {
          try {
            localStorage.removeItem(key)
          } catch {
            /* optional recovery storage */
          }
        }
        if (mounted.current) {
          setStatus('saved')
          setMessage('')
        }
      } else {
        storeRecovery()
        if (mounted.current) setStatus('unsaved')
      }
    } catch (error) {
      const conflict = error instanceof ApiError && error.status === 409
      if (conflict) blocked.current = true
      if (mounted.current) {
        setStatus(conflict ? 'conflict' : 'error')
        setMessage((error as Error).message)
      }
    } finally {
      saving.current = false
      if (
        mounted.current &&
        !blocked.current &&
        revision.current !== savedRevision.current &&
        mode === 'saved'
      ) {
        timer.current = setTimeout(() => void flush.current(), 5000)
      }
    }
  }, [drawingId, key, mode, readOnly, storeRecovery])

  useEffect(() => {
    flush.current = save
  }, [save])
  useEffect(() => {
    mounted.current = true
    if (initial.recovered) {
      toast.info('Recovered your unsaved changes from this browser')
      timer.current = setTimeout(() => void flush.current(), 1500)
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (mode === 'saved' && revision.current !== savedRevision.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const visibility = () => {
      if (document.visibilityState === 'hidden') void flush.current()
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [initial.recovered, mode])

  function dirty() {
    revision.current += 1
    if (!blocked.current) setStatus('unsaved')
    try {
      storeRecovery()
    } catch (error) {
      setStatus('error')
      setMessage((error as Error).message)
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush.current(), 1200)
  }
  function changed(
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) {
    if (readOnly || mode === 'shared') return
    // Excalidraw's "database" serializer intentionally omits image files.
    // Keep the portable local format so uploaded images survive a reload.
    const serialized = serializeAsJSON(elements, appState, files, 'local')
    if (serialized === lastScene.current) return
    const first = lastScene.current === null
    lastScene.current = serialized
    latest.current.scene = JSON.parse(serialized) as Scene
    // Persist restored templates once so they also receive a dashboard thumbnail.
    if (!first || initial.recovered || elements.length > 0) dirty()
  }
  function updateTitle(value: string) {
    setTitle(value)
    latest.current.title = value
    dirty()
  }
  async function exportDrawing(format: 'excalidraw' | 'png' | 'svg') {
    const editor = canvas.current
    if (!editor) return
    setExporting(true)
    try {
      const name =
        (latest.current.title || 'drawing')
          .replace(/[^a-z0-9 _-]/gi, '')
          .slice(0, 100) || 'drawing'
      if (format === 'excalidraw')
        downloadBlob(
          new Blob(
            [
              serializeAsJSON(
                editor.getSceneElementsIncludingDeleted(),
                editor.getAppState(),
                editor.getFiles(),
                'local',
              ),
            ],
            { type: 'application/json' },
          ),
          `${name}.excalidraw`,
        )
      else if (!editor.getSceneElements().length)
        toast.info('Add something to your canvas first')
      else if (format === 'png')
        downloadBlob(
          await exportToBlob({
            elements: editor.getSceneElements(),
            appState: { ...editor.getAppState(), exportBackground: true },
            files: editor.getFiles(),
            maxWidthOrHeight: 4096,
          }),
          `${name}.png`,
        )
      else {
        const svg = await exportToSvg({
          elements: editor.getSceneElements(),
          appState: editor.getAppState(),
          files: editor.getFiles(),
          renderEmbeddables: false,
        })
        downloadBlob(
          new Blob([svg.outerHTML], { type: 'image/svg+xml' }),
          `${name}.svg`,
        )
      }
    } catch (error) {
      toast.error(`Could not export: ${(error as Error).message}`)
    } finally {
      setExporting(false)
    }
  }
  async function leave() {
    await save()
    if (
      revision.current !== savedRevision.current &&
      mode === 'saved' &&
      !window.confirm(
        'Your latest changes are not saved to the server. A local recovery copy may be available, but downloading an export is safest. Leave anyway?',
      )
    )
      return
    router.push(mode === 'saved' ? `/app?w=${workspaceId}` : '/')
    router.refresh()
  }

  return (
    <div className="h-dvh overflow-hidden bg-white">
      <header className="flex h-[65px] items-center justify-between gap-2 border-b px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={leave}
            aria-label="Back to drawings"
          >
            <ArrowLeft />
          </Button>
          <Logo
            compact
            className="hidden sm:inline-flex"
            href={mode === 'saved' ? '/app' : '/'}
          />
          <span className="hidden h-6 w-px bg-border sm:block" />
          <div className="min-w-0">
            {readOnly || mode === 'shared' ? (
              <h1 className="max-w-60 truncate text-sm font-medium">{title}</h1>
            ) : (
              <Input
                aria-label="Drawing title"
                value={title}
                onChange={(event) => updateTitle(event.target.value)}
                onBlur={() => {
                  if (!title.trim()) updateTitle('Untitled drawing')
                }}
                maxLength={160}
                className="h-7 w-35 border-transparent bg-transparent px-1 text-sm font-medium shadow-none hover:border-input focus:border-input sm:w-60"
              />
            )}
            <p className="hidden px-1 text-[10px] text-muted-foreground sm:block">
              {mode === 'guest'
                ? 'Your private, browser-only canvas'
                : mode === 'shared'
                  ? 'Shared drawing · read only'
                  : workspaceName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {readOnly || mode === 'shared' ? (
            <Badge>
              <Eye className="size-3" />
              View only
            </Badge>
          ) : (
            <span
              role="status"
              className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"
            >
              {status === 'saving' ? (
                <Loader2 className="size-3 animate-spin" />
              ) : status === 'saved' ? (
                mode === 'guest' ? (
                  <HardDrive className="size-3" />
                ) : (
                  <Cloud className="size-3" />
                )
              ) : status === 'error' || status === 'conflict' ? (
                <TriangleAlert className="size-3 text-destructive" />
              ) : (
                <span className="size-1.5 rounded-full bg-amber-400" />
              )}
              {status === 'saved'
                ? mode === 'guest'
                  ? 'Saved in browser'
                  : 'All changes saved'
                : status === 'saving'
                  ? 'Saving…'
                  : status === 'unsaved'
                    ? 'Unsaved changes'
                    : 'Not saved'}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={exporting}
                aria-label="Download drawing"
              >
                {exporting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Download />
                )}
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="hidden size-3 sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportDrawing('excalidraw')}>
                Excalidraw file (.excalidraw)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportDrawing('png')}>
                Image (.png)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportDrawing('svg')}>
                Vector (.svg)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {mode === 'saved' && !readOnly && (
            <Button
              size="sm"
              onClick={async () => {
                await save()
                if (revision.current === savedRevision.current)
                  setShareOpen(true)
                else toast.error('Save your drawing before sharing it.')
              }}
            >
              <Share2 />
              Share
            </Button>
          )}
          {mode === 'guest' && (
            <Button size="sm" asChild>
              <Link href="/signup">
                <LogIn />
                <span className="hidden sm:inline">Create account</span>
              </Link>
            </Button>
          )}
          {mode === 'shared' && (
            <Button size="sm" asChild>
              <Link href="/guest">Make your own</Link>
            </Button>
          )}
        </div>
      </header>
      <div className="canvas-shell relative">
        <Excalidraw
          excalidrawAPI={(api) => {
            canvas.current = api
          }}
          initialData={initialData}
          onChange={changed}
          viewModeEnabled={readOnly || mode === 'shared'}
          name={title}
          aiEnabled={false}
          validateEmbeddable={false}
          UIOptions={{ canvasActions: { saveToActiveFile: false } }}
        />
        {guestNotice && (
          <div className="absolute bottom-5 left-1/2 z-10 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 items-center gap-3 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur">
            <HardDrive className="size-5 shrink-0 text-primary" />
            <div className="flex-1">
              <p className="text-xs font-medium">
                A little space, just for you
              </p>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                Saved in this browser only. Export to keep a backup. Clearing
                browser data removes this drawing.
              </p>
            </div>
            <button
              onClick={() => setGuestNotice(false)}
              className="rounded p-1 hover:bg-accent"
              aria-label="Dismiss guest notice"
            >
              <X className="size-4 text-muted-foreground" />
            </button>
          </div>
        )}
        {(status === 'error' || status === 'conflict') && (
          <div
            role="alert"
            className="absolute bottom-5 left-1/2 z-20 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-xl border border-red-200 bg-white p-4 shadow-lg"
          >
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-xs font-semibold">
                  {status === 'conflict'
                    ? 'Another version was saved'
                    : 'Your changes are not saved'}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {message}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportDrawing('excalidraw')}
                  >
                    <Download />
                    Export backup
                  </Button>
                  {status === 'conflict' ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Make sure you exported your changes. Reload the server version?',
                          )
                        )
                          window.location.reload()
                      }}
                    >
                      Reload drawing
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void save()}>
                      Retry save
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {staleRecovery && (
          <div className="absolute bottom-5 left-1/2 z-20 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-xl border bg-white p-4 shadow-lg">
            <p className="text-xs font-medium">
              An older unsaved local copy is available
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The server has a newer version. Download the local copy before
              dismissing this notice.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadBlob(
                    new Blob(
                      [
                        json({
                          type: 'excalidraw',
                          version: 2,
                          source: 'drawspace',
                          ...staleRecovery.scene,
                        }),
                      ],
                      { type: 'application/json' },
                    ),
                    'recovered-drawing.excalidraw',
                  )
                }
              >
                <Download />
                Download local copy
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setStaleRecovery(null)
                  try {
                    localStorage.removeItem(`${key}:stale`)
                  } catch {
                    /* optional storage */
                  }
                }}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
      {drawingId && workspaceId && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          drawingId={drawingId}
          workspaceId={workspaceId}
        />
      )}
    </div>
  )
}
