import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { NextRequest } from 'next/server'
import { sql } from '../../src/lib/db'
import { createSession } from '../../src/lib/auth'
import { finishDiscord, startDiscord } from '../../src/lib/discord-flow'
import type { DiscordProfile } from '../../src/lib/discord'
import { getDiscordEmailLink } from '../../src/lib/discord-email-link'
import { mailEnabled, sendEmail } from '../../src/lib/mail'
import { hashPassword, hashToken, token } from '../../src/lib/crypto'
import { POST as confirmPost } from '../../src/app/api/auth/discord/confirm/route'

const cookieJar = vi.hoisted(() => new Map<string, string>())
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
}))
vi.mock('@/lib/auth', () => ({
  getUser: vi.fn(async () => null),
  createSession: vi.fn(),
  SESSION_COOKIE: 'drawspace_session',
}))
vi.mock('@/lib/mail', () => ({ mailEnabled: vi.fn(), sendEmail: vi.fn() }))

const origin = 'http://localhost:3312'
const prefix = `email-link-test-${token().slice(0, 10).toLowerCase()}`
let sequence = 0
const fetchMock = vi.fn()
const states: string[] = []

function discordProfile(email: string): DiscordProfile {
  sequence++
  return {
    id: `${Date.now()}${sequence.toString().padStart(4, '0')}`,
    username: 'discord_person',
    global_name: 'Discord Person',
    email,
    verified: true,
  }
}

async function localUser() {
  sequence++
  const [user] = await sql<{ id: string; email: string }[]>`
    INSERT INTO users (name, email, password_hash)
    VALUES ('Existing Person', ${`${prefix}-${sequence}@example.com`}, ${await hashPassword('test-password-only')})
    RETURNING id, email
  `
  return user
}

async function account(id: string) {
  const [user] = await sql<
    { discord_id: string | null; password_hash: string | null }[]
  >`SELECT discord_id, password_hash FROM users WHERE id = ${id}`
  return user
}

async function discordLogin(person: DiscordProfile) {
  const start = await startDiscord(
    new NextRequest(`${origin}/api/auth/discord`),
  )
  const state = new URL(start.headers.get('location')!).searchParams.get(
    'state',
  )!
  states.push(hashToken(state))
  cookieJar.set(
    'drawspace_discord',
    start.cookies.get('drawspace_discord')!.value,
  )
  fetchMock
    .mockResolvedValueOnce(
      Response.json({
        access_token: 'private-provider-token',
        token_type: 'Bearer',
        scope: 'identify email',
      }),
    )
    .mockResolvedValueOnce(Response.json(person))
  const url = new URL('/api/auth/discord/callback', origin)
  url.search = new URLSearchParams({
    state,
    code: 'authorization-code',
    iss: 'https://discord.com',
  }).toString()
  return finishDiscord(new NextRequest(url))
}

function emailedToken(call = -1) {
  const text = vi.mocked(sendEmail).mock.calls.at(call)![0].text
  const link = text.match(/https?:\/\/\S+/)![0]
  expect(link.startsWith(`${origin}/auth/discord/confirm?token=`)).toBe(true)
  return new URL(link).searchParams.get('token')!
}

function confirm(
  value: string,
  options: { disablePassword?: boolean; origin?: string } = {},
) {
  const body = new URLSearchParams({ token: value })
  if (options.disablePassword) body.set('disablePassword', 'on')
  return confirmPost(
    new NextRequest(`${origin}/api/auth/discord/confirm`, {
      method: 'POST',
      headers: {
        origin: options.origin ?? origin,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    }),
  )
}

beforeEach(() => {
  vi.stubEnv('APP_URL', origin)
  vi.stubEnv('COOKIE_SECURE', 'false')
  vi.stubEnv('ALLOW_REGISTRATION', 'true')
  vi.stubEnv('DISCORD_CLIENT_ID', 'test-client-id')
  vi.stubEnv('DISCORD_CLIENT_SECRET', 'test-client-secret')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  cookieJar.clear()
  vi.mocked(createSession).mockReset()
  vi.mocked(mailEnabled).mockReset().mockReturnValue(true)
  vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
afterAll(async () => {
  await sql`DELETE FROM discord_auth_requests WHERE state_hash IN ${sql(states)}`
  await sql`DELETE FROM rate_limits WHERE key LIKE 'discord-link-email%'`
  await sql`DELETE FROM users WHERE email LIKE ${`${prefix}%`}`
  await sql.end()
})

describe('Discord connection by email confirmation', () => {
  it('emails the existing account instead of linking or signing in', async () => {
    const user = await localUser()
    const response = await discordLogin(discordProfile(user.email))
    expect(response.headers.get('location')).toBe(
      `${origin}/login?discord_email=sent`,
    )
    expect(createSession).not.toHaveBeenCalled()
    expect((await account(user.id)).discord_id).toBeNull()
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const message = vi.mocked(sendEmail).mock.calls[0][0]
    expect(message.to).toBe(user.email)
    expect(message.text).toContain('Discord Person')
    const value = emailedToken()
    const [stored] = await sql`
      SELECT * FROM discord_link_requests WHERE user_id = ${user.id}
    `
    expect(stored.token_hash).toBe(hashToken(value))
    expect(stored.token_hash).not.toBe(value)
    expect(new Date(stored.expires_at).getTime() - Date.now()).toBeLessThan(
      30 * 60000 + 5000,
    )
  })

  it('shows a non-consuming confirmation page, then links on a same-origin POST and revokes sessions', async () => {
    const user = await localUser()
    const person = discordProfile(user.email)
    await discordLogin(person)
    const value = emailedToken()
    await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${hashToken(token())}, ${user.id}, now() + interval '1 day')`
    for (let i = 0; i < 2; i++)
      expect(await getDiscordEmailLink(value)).toEqual({
        name: 'Existing Person',
        email: user.email,
        discord_name: 'Discord Person',
        has_password: true,
      })
    expect(await getDiscordEmailLink('not-a-token')).toBeNull()
    expect(await getDiscordEmailLink(token())).toBeNull()

    const forged = await confirm(value, { origin: 'https://attacker.example' })
    expect(forged.status).toBe(403)
    expect((await account(user.id)).discord_id).toBeNull()

    const response = await confirm(value)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      `${origin}/app/settings?discord_connected=true`,
    )
    const linked = await account(user.id)
    expect(linked.discord_id).toBe(person.id)
    expect(linked.password_hash).not.toBeNull()
    expect(createSession).toHaveBeenCalledWith(user.id)
    expect(
      await sql`SELECT 1 FROM sessions WHERE user_id = ${user.id}`,
    ).toHaveLength(0)

    const replay = await confirm(value)
    expect(replay.headers.get('location')).toBe(
      `${origin}/login?discord_error=link_expired`,
    )
    expect(createSession).toHaveBeenCalledTimes(1)
  })

  it('can turn off password sign-in when confirming', async () => {
    const user = await localUser()
    await discordLogin(discordProfile(user.email))
    await confirm(emailedToken(), { disablePassword: true })
    const linked = await account(user.id)
    expect(linked.discord_id).not.toBeNull()
    expect(linked.password_hash).toBeNull()
  })

  it('rejects expired and superseded links', async () => {
    const user = await localUser()
    await discordLogin(discordProfile(user.email))
    const first = emailedToken()
    await discordLogin(discordProfile(user.email))
    const second = emailedToken()
    expect((await confirm(first)).headers.get('location')).toBe(
      `${origin}/login?discord_error=link_expired`,
    )
    await sql`UPDATE discord_link_requests SET expires_at = now() - interval '1 second' WHERE token_hash = ${hashToken(second)}`
    expect(await getDiscordEmailLink(second)).toBeNull()
    expect((await confirm(second)).headers.get('location')).toBe(
      `${origin}/login?discord_error=link_expired`,
    )
    expect((await account(user.id)).discord_id).toBeNull()
  })

  it('allows only one of two concurrent confirmations', async () => {
    const user = await localUser()
    await discordLogin(discordProfile(user.email))
    const value = emailedToken()
    const results = await Promise.all([confirm(value), confirm(value)])
    expect(
      results.map((response) => response.headers.get('location')).sort(),
    ).toEqual([
      `${origin}/app/settings?discord_connected=true`,
      `${origin}/login?discord_error=link_expired`,
    ])
    expect(createSession).toHaveBeenCalledTimes(1)
  })

  it('refuses if the Discord identity was connected elsewhere meanwhile', async () => {
    const user = await localUser()
    const other = await localUser()
    const person = discordProfile(user.email)
    await discordLogin(person)
    const value = emailedToken()
    await sql`UPDATE users SET discord_id = ${person.id} WHERE id = ${other.id}`
    expect((await confirm(value)).headers.get('location')).toBe(
      `${origin}/login?discord_error=linked`,
    )
    expect((await account(user.id)).discord_id).toBeNull()
    expect(createSession).not.toHaveBeenCalled()
  })

  it('works for existing accounts while registration is disabled', async () => {
    vi.stubEnv('ALLOW_REGISTRATION', 'false')
    const user = await localUser()
    expect(
      (await discordLogin(discordProfile(user.email))).headers.get('location'),
    ).toBe(`${origin}/login?discord_email=sent`)
    const stranger = await discordLogin(
      discordProfile(`${prefix}-nobody-${sequence}@example.com`),
    )
    expect(stranger.headers.get('location')).toBe(
      `${origin}/login?discord_error=registration`,
    )
  })

  it('limits confirmation emails per account', async () => {
    const user = await localUser()
    for (let i = 0; i < 3; i++)
      expect(
        (await discordLogin(discordProfile(user.email))).headers.get(
          'location',
        ),
      ).toBe(`${origin}/login?discord_email=sent`)
    const limited = await discordLogin(discordProfile(user.email))
    expect(limited.headers.get('location')).toBe(
      `${origin}/login?discord_error=email_limit`,
    )
    expect(sendEmail).toHaveBeenCalledTimes(3)
  })

  it('removes the link and reports failure when delivery fails', async () => {
    const user = await localUser()
    vi.mocked(sendEmail).mockRejectedValueOnce(
      new Error('provider detail that must not leak'),
    )
    const response = await discordLogin(discordProfile(user.email))
    expect(response.headers.get('location')).toBe(
      `${origin}/login?discord_error=email_failed`,
    )
    expect(
      await sql`SELECT 1 FROM discord_link_requests WHERE user_id = ${user.id}`,
    ).toHaveLength(0)
  })

  it('falls back to password-then-connect guidance without email delivery', async () => {
    vi.mocked(mailEnabled).mockReturnValue(false)
    const user = await localUser()
    const response = await discordLogin(discordProfile(user.email))
    expect(response.headers.get('location')).toBe(
      `${origin}/login?discord_error=account_exists`,
    )
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('keeps user-controlled names on one line in the email', async () => {
    const user = await localUser()
    await discordLogin({
      ...discordProfile(user.email),
      global_name: 'Evil\nhttps://phish.example\u202e',
    })
    const text = vi.mocked(sendEmail).mock.calls[0][0].text
    expect(text).toContain('"Evil https://phish.example"')
    expect(text.match(/^https?:\/\//gm)).toHaveLength(1)
  })

  it('rejects malformed confirmation requests', async () => {
    const wrongType = await confirmPost(
      new NextRequest(`${origin}/api/auth/discord/confirm`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ token: token() }),
      }),
    )
    expect(wrongType.status).toBe(400)
    expect((await confirm('short')).headers.get('location')).toBe(
      `${origin}/login?discord_error=link_expired`,
    )
  })
})
