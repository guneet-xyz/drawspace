import { cp, mkdir } from 'node:fs/promises'

await mkdir('public/excalidraw-assets', { recursive: true })
await cp(
  'node_modules/@excalidraw/excalidraw/dist/prod/fonts',
  'public/excalidraw-assets/fonts',
  {
    recursive: true,
  },
)
