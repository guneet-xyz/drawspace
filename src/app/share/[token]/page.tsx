import { notFound } from "next/navigation"

import { EditorLoader } from "@/components/editor-loader"
import { getSharedDrawing } from "@/lib/data"

export const dynamic = "force-dynamic"
export const metadata = { title: "Shared drawing", referrer: "no-referrer" }
export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const drawing = await getSharedDrawing(token)
  if (!drawing) notFound()
  return (
    <EditorLoader
      mode="shared"
      title={drawing.title}
      scene={drawing.scene}
      version={drawing.version}
      readOnly
    />
  )
}
