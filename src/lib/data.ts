import 'server-only'
import { sql } from '@/lib/db'
import { hashToken } from '@/lib/crypto'
import type {
  Drawing,
  DrawingDocument,
  Member,
  User,
  Workspace,
} from '@/lib/types'

export async function getWorkspaces(userId: string) {
  return sql<Workspace[]>`
    SELECT w.id, w.name, m.role,
      (SELECT count(*)::int FROM memberships WHERE workspace_id = w.id) AS member_count
    FROM workspaces w JOIN memberships m ON m.workspace_id = w.id
    WHERE m.user_id = ${userId} ORDER BY w.created_at
  `
}

export async function getDrawings(workspaceId: string, userId: string) {
  return sql<Drawing[]>`
    SELECT d.id, d.workspace_id, d.title, d.thumbnail, d.version, d.updated_at,
      u.name AS creator_name, (f.user_id IS NOT NULL) AS favorite
    FROM drawings d JOIN memberships m ON m.workspace_id = d.workspace_id AND m.user_id = ${userId}
    LEFT JOIN users u ON u.id = d.created_by
    LEFT JOIN favorites f ON f.drawing_id = d.id AND f.user_id = ${userId}
    WHERE d.workspace_id = ${workspaceId} ORDER BY d.updated_at DESC
  `
}

export async function getDrawing(id: string, userId: string) {
  const [drawing] = await sql<DrawingDocument[]>`
    SELECT d.*, m.role, w.name AS workspace_name, u.name AS creator_name,
      (f.user_id IS NOT NULL) AS favorite
    FROM drawings d JOIN memberships m ON m.workspace_id = d.workspace_id AND m.user_id = ${userId}
    JOIN workspaces w ON w.id = d.workspace_id LEFT JOIN users u ON u.id = d.created_by
    LEFT JOIN favorites f ON f.drawing_id = d.id AND f.user_id = ${userId}
    WHERE d.id = ${id}
  `
  return drawing ?? null
}

export async function getMembers(workspaceId: string) {
  return sql<Member[]>`
    SELECT u.id, u.name, u.email, m.role, m.created_at
    FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId} ORDER BY m.created_at
  `
}

export async function getSharedDrawing(value: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null
  const [drawing] = await sql<
    (Pick<DrawingDocument, 'id' | 'title' | 'scene' | 'version'> & {
      owner_name: string
    })[]
  >`
    SELECT d.id, d.title, d.scene, d.version, u.name AS owner_name
    FROM shares s JOIN drawings d ON d.id = s.drawing_id LEFT JOIN users u ON u.id = d.created_by
    WHERE s.token_hash = ${hashToken(value)} AND (s.expires_at IS NULL OR s.expires_at > now())
  `
  return drawing ?? null
}

export function publicUser(user: User) {
  return { id: user.id, name: user.name, email: user.email }
}
