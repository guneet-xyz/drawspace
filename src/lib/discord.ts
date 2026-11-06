import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { emailSchema } from '@/lib/validation'
import type { User } from '@/lib/types'
import { DISCORD_ERRORS } from '@/lib/discord-messages'

export class DiscordError extends Error {
  constructor(public code: keyof typeof DISCORD_ERRORS) {
    super(DISCORD_ERRORS[code])
  }
}

export function discordEnabled() {
  return Boolean(
    process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET,
  )
}

export function appOrigin() {
  return new URL(process.env.APP_URL || 'http://localhost:3000').origin
}

function config() {
  if (!discordEnabled()) throw new DiscordError('disabled')
  return {
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    redirectUri: `${appOrigin()}/api/auth/discord/callback`,
  }
}

export function discordAuthorizationUrl(state: string, verifier: string) {
  const { clientId, redirectUri } = config()
  const url = new URL('https://discord.com/oauth2/authorize')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify email',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'consent',
  }).toString()
  return url
}

const profileSchema = z.object({
  id: z.string().regex(/^\d{1,32}$/),
  username: z.string().trim().min(1).max(80),
  global_name: z.string().trim().max(80).nullable().optional(),
  email: emailSchema,
  verified: z.literal(true),
})
export type DiscordProfile = z.infer<typeof profileSchema>

export async function getDiscordProfile(code: string, verifier: string) {
  const { clientId, clientSecret, redirectUri } = config()
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new DiscordError('failed')
  const credentials = z
    .object({
      access_token: z.string().min(1).max(4096),
      token_type: z.string().regex(/^Bearer$/i),
      scope: z.string(),
    })
    .parse(await response.json())
  const scopes = credentials.scope.split(' ')
  if (!scopes.includes('identify') || !scopes.includes('email'))
    throw new DiscordError('email')
  const profileResponse = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  })
  if (!profileResponse.ok) throw new DiscordError('failed')
  const profile = profileSchema.safeParse(await profileResponse.json())
  if (!profile.success) throw new DiscordError('email')
  // Provider tokens are only used for this request, never stored or sent to the browser.
  return profile.data
}

export async function resolveDiscordUser(
  profile: DiscordProfile,
  linkUserId: string | null,
): Promise<User> {
  return sql.begin(async (tx) => {
    // Serialize signups/linking for the same provider identity across instances.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${profile.id}, 0))`
    const [existing] = await tx<User[]>`
      SELECT id, name, email FROM users WHERE discord_id = ${profile.id}
    `
    if (existing) {
      if (linkUserId && existing.id !== linkUserId)
        throw new DiscordError('linked')
      return existing
    }
    if (linkUserId) {
      const [target] = await tx`
        SELECT discord_id FROM users WHERE id = ${linkUserId} FOR UPDATE
      `
      if (!target || target.discord_id) throw new DiscordError('linked')
      const [user] = await tx<User[]>`
        UPDATE users SET discord_id = ${profile.id} WHERE id = ${linkUserId}
        RETURNING id, name, email
      `
      return user
    }
    if (process.env.ALLOW_REGISTRATION === 'false')
      throw new DiscordError('registration')
    const [matching] =
      await tx`SELECT id FROM users WHERE email = ${profile.email}`
    // Local emails aren't verified: never automatically merge by email.
    if (matching) throw new DiscordError('account_exists')
    const name = profile.global_name || profile.username
    const [user] = await tx<User[]>`
      INSERT INTO users (name, email, discord_id)
      VALUES (${name}, ${profile.email}, ${profile.id}) RETURNING id, name, email
    `
    const [workspace] = await tx`
      INSERT INTO workspaces (name) VALUES (${`${name.split(' ')[0]}'s workspace`.slice(0, 80)}) RETURNING id
    `
    await tx`INSERT INTO memberships (workspace_id, user_id, role) VALUES (${workspace.id}, ${user.id}, 'owner')`
    return user
  })
}
