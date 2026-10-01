import { EditorLoader } from '@/components/editor-loader'

export const metadata = { title: 'Guest canvas' }
export default function GuestPage() {
  return <EditorLoader mode="guest" />
}
