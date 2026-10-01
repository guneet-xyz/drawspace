import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getDrawing } from '@/lib/data'
import { canEdit } from '@/lib/permissions'
import { idSchema } from '@/lib/validation'
import { EditorLoader } from '@/components/editor-loader'

export const metadata = { title: 'Drawing' }
export default async function DrawingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params
  if (!idSchema.safeParse(id).success) notFound()
  const drawing = await getDrawing(id, user.id)
  if (!drawing) notFound()
  return (
    <EditorLoader
      mode="saved"
      drawingId={id}
      workspaceId={drawing.workspace_id}
      workspaceName={drawing.workspace_name}
      title={drawing.title}
      scene={drawing.scene}
      version={drawing.version}
      readOnly={!canEdit(drawing.role)}
    />
  )
}
