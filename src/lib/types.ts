export type Role = 'owner' | 'admin' | 'editor' | 'viewer'
export type User = { id: string; name: string; email: string }
export type Workspace = {
  id: string
  name: string
  role: Role
  member_count: number
}
export type Scene = {
  elements: unknown[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
}
export type Drawing = {
  id: string
  workspace_id: string
  title: string
  thumbnail: string | null
  version: number
  updated_at: string
  creator_name: string | null
  favorite: boolean
}
export type DrawingDocument = Drawing & {
  scene: Scene
  role: Role
  workspace_name: string
}
export type Member = User & { role: Role; created_at: string }
export type Share = {
  id: string
  created_at: string
  expires_at: string | null
}
