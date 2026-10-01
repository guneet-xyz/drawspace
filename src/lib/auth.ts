import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { hashToken, token } from '@/lib/crypto'
import type { User } from '@/lib/types'

export const SESSION_COOKIE = 'drawspace_session'

export async function getUser(): Promise<User | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value
  if (!value) return null
  const [user] = await sql<User[]>`
    SELECT u.id, u.name, u.email FROM users u JOIN sessions s ON s.user_id = u.id
    WHERE s.token_hash = ${hashToken(value)} AND s.expires_at > now()
  `
  return user ?? null
}

export async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}

export async function createSession(userId: string) {
  const value = token()
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${hashToken(value)}, ${userId}, ${expires})`
  await sql`DELETE FROM sessions WHERE expires_at < now()`
  ;(await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    expires,
  })
}
