import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import type { TransactionSql } from 'postgres'
import { sql } from '@/lib/db'
import { createSession, getUser, SESSION_COOKIE } from '@/lib/auth'
import { hashPassword, hashToken, token, verifyPassword } from '@/lib/crypto'
import { getDrawing, getDrawings, getMembers, getWorkspaces } from '@/lib/data'
import { canEdit, canManage, canManageMember } from '@/lib/permissions'
import {
  emailSchema,
  idSchema,
  nameSchema,
  passwordSchema,
  roleSchema,
  saveSchema,
  sceneSchema,
  titleSchema,
} from '@/lib/validation'
import type { Role } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
const deny = () => {
  throw new HttpError(403, 'You do not have permission to do this.')
}
const missing = () => {
  throw new HttpError(
    404,
    'This resource was not found, or you do not have access.',
  )
}
const ok = (value: unknown = { success: true }, status = 200) =>
  NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } })

async function body(req: NextRequest): Promise<unknown> {
  const limit = 16 * 1024 * 1024
  if (Number(req.headers.get('content-length')) > limit)
    throw new HttpError(413, 'Drawing is too large. Maximum size is 16 MB.')
  const reader = req.body?.getReader()
  if (!reader) throw new HttpError(400, 'A JSON body is required.')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new HttpError(413, 'Drawing is too large. Maximum size is 16 MB.')
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Invalid JSON body.')
  }
}

async function rateLimit(key: string, max: number, seconds: number) {
  const [row] = await sql`
    INSERT INTO rate_limits (key, attempts, resets_at) VALUES (${key}, 1, now() + ${seconds} * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN rate_limits.resets_at < now() THEN 1 ELSE rate_limits.attempts + 1 END,
      resets_at = CASE WHEN rate_limits.resets_at < now() THEN now() + ${seconds} * interval '1 second' ELSE rate_limits.resets_at END
    RETURNING attempts
  `
  await sql`DELETE FROM rate_limits WHERE resets_at < now() - interval '1 day'`
  if (row.attempts > max)
    throw new HttpError(429, 'Too many attempts. Please try again later.')
}

async function withWorkspace(
  id: string,
  userId: string,
  fn: (tx: TransactionSql, role: Role) => Promise<unknown>,
) {
  return sql.begin(async (tx) => {
    // Serialize mutations with membership changes, avoiding permission-revocation races.
    await tx`SELECT id FROM workspaces WHERE id = ${id} FOR UPDATE`
    const [member] = await tx<
      { role: Role }[]
    >`SELECT role FROM memberships WHERE workspace_id = ${id} AND user_id = ${userId}`
    if (!member) missing()
    return fn(tx, member.role)
  })
}

async function withDrawing(
  id: string,
  userId: string,
  fn: (tx: TransactionSql, role: Role) => Promise<unknown>,
) {
  const [drawing] =
    await sql`SELECT workspace_id FROM drawings WHERE id = ${id}`
  if (!drawing) missing()
  return withWorkspace(drawing.workspace_id, userId, async (tx, role) => {
    const [exists] = await tx`SELECT id FROM drawings WHERE id = ${id}`
    if (!exists) missing()
    return fn(tx, role)
  })
}

async function handle(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params
    const [resource, rawId, action, rawChildId] = path
    const method = req.method
    if (method !== 'GET') {
      const expected = new URL(process.env.APP_URL || 'http://localhost:3000')
        .origin
      if (req.headers.get('origin') !== expected)
        throw new HttpError(
          403,
          'Request origin is not allowed. Check APP_URL.',
        )
      if (
        method !== 'DELETE' &&
        !req.headers.get('content-type')?.startsWith('application/json')
      )
        throw new HttpError(415, 'Use application/json.')
    }

    if (resource === 'health' && method === 'GET' && path.length === 1) {
      await sql`SELECT 1`
      return ok({ status: 'ok' })
    }

    if (resource === 'auth') {
      if (rawId === 'register' && method === 'POST') {
        if (process.env.ALLOW_REGISTRATION === 'false')
          throw new HttpError(
            403,
            'Registration is disabled. Contact your administrator.',
          )
        await rateLimit('registration', 30, 3600)
        const data = z
          .object({
            name: nameSchema,
            email: emailSchema,
            password: passwordSchema,
          })
          .parse(await body(req))
        const passwordHash = await hashPassword(data.password)
        const user = await sql.begin(async (tx) => {
          const [user] =
            await tx`INSERT INTO users (name, email, password_hash) VALUES (${data.name}, ${data.email}, ${passwordHash}) RETURNING id, name, email`
          const [workspace] =
            await tx`INSERT INTO workspaces (name) VALUES (${`${data.name.split(' ')[0]}'s workspace`}) RETURNING id`
          await tx`INSERT INTO memberships (workspace_id, user_id, role) VALUES (${workspace.id}, ${user.id}, 'owner')`
          return user
        })
        await createSession(user.id)
        return ok(user, 201)
      }
      if (rawId === 'login' && method === 'POST') {
        const data = z
          .object({ email: emailSchema, password: z.string().min(1).max(128) })
          .parse(await body(req))
        await rateLimit(`login:${hashToken(data.email)}`, 10, 900)
        const [user] =
          await sql`SELECT * FROM users WHERE email = ${data.email}`
        // Still run scrypt for missing accounts to reduce email enumeration via timing.
        const valid = await verifyPassword(
          data.password,
          user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`,
        )
        if (!user || !valid)
          throw new HttpError(401, 'Incorrect email or password.')
        await createSession(user.id)
        return ok({ id: user.id, name: user.name, email: user.email })
      }
      if (rawId === 'logout' && method === 'POST') {
        const cookie = (await cookies()).get(SESSION_COOKIE)?.value
        if (cookie)
          await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(cookie)}`
        ;(await cookies()).delete(SESSION_COOKIE)
        return ok()
      }
    }

    const user = await getUser()
    if (!user) throw new HttpError(401, 'Please sign in to continue.')

    if (resource === 'account' && path.length === 1) {
      if (method === 'GET') return ok(user)
      if (method === 'PATCH') {
        const data = z.object({ name: nameSchema }).parse(await body(req))
        await sql`UPDATE users SET name = ${data.name} WHERE id = ${user.id}`
        return ok({ ...user, name: data.name })
      }
    }
    if (resource === 'account' && rawId === 'password' && method === 'POST') {
      await rateLimit(`password:${user.id}`, 10, 900)
      const data = z
        .object({
          currentPassword: z.string().min(1).max(128),
          password: passwordSchema,
        })
        .parse(await body(req))
      const [record] =
        await sql`SELECT password_hash FROM users WHERE id = ${user.id}`
      if (!(await verifyPassword(data.currentPassword, record.password_hash)))
        throw new HttpError(400, 'Your current password is incorrect.')
      const passwordHash = await hashPassword(data.password)
      await sql.begin(async (tx) => {
        await tx`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${user.id}`
        await tx`DELETE FROM sessions WHERE user_id = ${user.id}`
      })
      await createSession(user.id)
      return ok()
    }

    if (resource === 'workspaces') {
      if (path.length === 1) {
        if (method === 'GET') return ok(await getWorkspaces(user.id))
        if (method === 'POST') {
          const data = z.object({ name: nameSchema }).parse(await body(req))
          await rateLimit(`workspaces:${user.id}`, 30, 3600)
          const workspace = await sql.begin(async (tx) => {
            const [w] =
              await tx`INSERT INTO workspaces (name) VALUES (${data.name}) RETURNING id, name`
            await tx`INSERT INTO memberships (workspace_id, user_id, role) VALUES (${w.id}, ${user.id}, 'owner')`
            return { ...w, role: 'owner', member_count: 1 }
          })
          return ok(workspace, 201)
        }
      }
      const id = idSchema.parse(rawId)
      if (!action && method === 'PATCH') {
        const data = z.object({ name: nameSchema }).parse(await body(req))
        return ok(
          await withWorkspace(id, user.id, async (tx, role) => {
            if (!canManage(role)) deny()
            const [w] =
              await tx`UPDATE workspaces SET name = ${data.name} WHERE id = ${id} RETURNING id, name`
            return w
          }),
        )
      }
      if (!action && method === 'DELETE') {
        await withWorkspace(id, user.id, async (tx, role) => {
          if (role !== 'owner') deny()
          await tx`DELETE FROM workspaces WHERE id = ${id}`
        })
        return ok()
      }
      if (action === 'drawings' && method === 'GET') {
        const workspaces = await getWorkspaces(user.id)
        if (!workspaces.some((w) => w.id === id)) missing()
        return ok(await getDrawings(id, user.id))
      }
      if (action === 'members') {
        if (method === 'GET') {
          const workspaces = await getWorkspaces(user.id)
          if (!workspaces.some((w) => w.id === id)) missing()
          return ok(await getMembers(id))
        }
        if (method === 'POST') {
          const data = z
            .object({ email: emailSchema, role: roleSchema })
            .parse(await body(req))
          await withWorkspace(id, user.id, async (tx, role) => {
            if (!canManageMember(role, data.role, data.role)) deny()
            const [target] =
              await tx`SELECT id FROM users WHERE email = ${data.email}`
            if (!target)
              throw new HttpError(
                400,
                'This person needs to create an account first. Ask them to sign up, then add them here.',
              )
            const [added] =
              await tx`INSERT INTO memberships (workspace_id, user_id, role) VALUES (${id}, ${target.id}, ${data.role}) ON CONFLICT DO NOTHING RETURNING user_id`
            if (!added)
              throw new HttpError(
                409,
                'This person is already in the workspace.',
              )
          })
          return ok(await getMembers(id), 201)
        }
        const targetId = idSchema.parse(rawChildId)
        if (method === 'PATCH' || method === 'DELETE') {
          const nextRole =
            method === 'PATCH'
              ? z.object({ role: roleSchema }).parse(await body(req)).role
              : undefined
          await withWorkspace(id, user.id, async (tx, role) => {
            const [target] = await tx<
              { role: Role }[]
            >`SELECT role FROM memberships WHERE workspace_id = ${id} AND user_id = ${targetId}`
            if (!target) missing()
            if (!canManageMember(role, target.role, nextRole)) deny()
            if (nextRole)
              await tx`UPDATE memberships SET role = ${nextRole} WHERE workspace_id = ${id} AND user_id = ${targetId}`
            else
              await tx`DELETE FROM memberships WHERE workspace_id = ${id} AND user_id = ${targetId}`
          })
          return ok(await getMembers(id))
        }
      }
    }

    if (resource === 'drawings') {
      if (path.length === 1 && method === 'POST') {
        const data = z
          .object({
            workspaceId: idSchema,
            title: titleSchema.default('Untitled drawing'),
            scene: sceneSchema.optional(),
          })
          .parse(await body(req))
        const drawing = await withWorkspace(
          data.workspaceId,
          user.id,
          async (tx, role) => {
            if (!canEdit(role)) deny()
            const [drawing] = await tx`
            INSERT INTO drawings (workspace_id, created_by, title, scene)
            VALUES (${data.workspaceId}, ${user.id}, ${data.title}, ${tx.json(data.scene ?? { elements: [], appState: {}, files: {} })}) RETURNING id
          `
            return drawing
          },
        )
        return ok(drawing, 201)
      }
      const id = idSchema.parse(rawId)
      if (!action && method === 'GET') {
        const drawing = await getDrawing(id, user.id)
        if (!drawing) missing()
        return ok(drawing)
      }
      if (!action && method === 'PATCH') {
        const data = saveSchema.parse(await body(req))
        const drawing = await withDrawing(id, user.id, async (tx, role) => {
          if (!canEdit(role)) deny()
          const values: Record<string, unknown> = {
            updated_at: new Date(),
            version: data.version + 1,
          }
          if (data.title !== undefined) values.title = data.title
          if (data.scene !== undefined) values.scene = tx.json(data.scene)
          if (data.thumbnail !== undefined) values.thumbnail = data.thumbnail
          const [updated] =
            await tx`UPDATE drawings SET ${tx(values)} WHERE id = ${id} AND version = ${data.version} RETURNING version, updated_at`
          if (!updated)
            throw new HttpError(
              409,
              'This drawing changed in another tab. Export your changes before reloading.',
            )
          return updated
        })
        return ok(drawing)
      }
      if (!action && method === 'DELETE') {
        await withDrawing(id, user.id, async (tx, role) => {
          if (!canEdit(role)) deny()
          await tx`DELETE FROM drawings WHERE id = ${id}`
        })
        return ok()
      }
      if (action === 'duplicate' && method === 'POST') {
        const result = await withDrawing(id, user.id, async (tx, role) => {
          if (!canEdit(role)) deny()
          const [drawing] = await tx`
            INSERT INTO drawings (workspace_id, created_by, title, scene, thumbnail)
            SELECT workspace_id, ${user.id}, left(title, 153) || ' (copy)', scene, thumbnail FROM drawings WHERE id = ${id}
            RETURNING id
          `
          return drawing
        })
        return ok(result, 201)
      }
      if (action === 'favorite' && method === 'POST') {
        const data = z.object({ favorite: z.boolean() }).parse(await body(req))
        await withDrawing(id, user.id, async (tx) => {
          if (data.favorite)
            await tx`INSERT INTO favorites (drawing_id, user_id) VALUES (${id}, ${user.id}) ON CONFLICT DO NOTHING`
          else
            await tx`DELETE FROM favorites WHERE drawing_id = ${id} AND user_id = ${user.id}`
        })
        return ok()
      }
      if (action === 'shares') {
        if (method === 'GET') {
          const drawing = await getDrawing(id, user.id)
          if (!drawing) missing()
          if (!canEdit(drawing.role)) deny()
          return ok(
            await sql`SELECT id, created_at, expires_at FROM shares WHERE drawing_id = ${id} AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC`,
          )
        }
        if (method === 'POST') {
          const data = z
            .object({
              expiresInDays: z.union([z.literal(7), z.literal(30)]).nullable(),
            })
            .parse(await body(req))
          const value = token()
          const expires = data.expiresInDays
            ? new Date(Date.now() + data.expiresInDays * 86400000)
            : null
          const share = await withDrawing(id, user.id, async (tx, role) => {
            if (!canEdit(role)) deny()
            const [share] =
              await tx`INSERT INTO shares (drawing_id, token_hash, created_by, expires_at) VALUES (${id}, ${hashToken(value)}, ${user.id}, ${expires}) RETURNING id, created_at, expires_at`
            return share
          })
          return ok(
            {
              ...(share as object),
              url: `${new URL(process.env.APP_URL || 'http://localhost:3000').origin}/share/${value}`,
            },
            201,
          )
        }
        if (method === 'DELETE') {
          const shareId = idSchema.parse(rawChildId)
          await withDrawing(id, user.id, async (tx, role) => {
            if (!canEdit(role)) deny()
            await tx`DELETE FROM shares WHERE id = ${shareId} AND drawing_id = ${id}`
          })
          return ok()
        }
      }
    }
    throw new HttpError(404, 'Endpoint not found.')
  } catch (error) {
    if (error instanceof HttpError)
      return ok({ error: error.message }, error.status)
    if (error instanceof z.ZodError)
      return ok({ error: error.issues[0]?.message || 'Invalid input.' }, 400)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505'
    )
      return ok(
        { error: 'This email is already registered. Please sign in.' },
        409,
      )
    console.error('API request failed:', error)
    return ok(
      {
        error: 'The server could not complete your request. Please try again.',
      },
      500,
    )
  }
}

export const GET = handle
export const POST = handle
export const PATCH = handle
export const DELETE = handle
