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
import { createSession, getUser } from '../../src/lib/auth'
import { finishDiscord, startDiscord } from '../../src/lib/discord-flow'
import { resolveDiscordUser, type DiscordProfile } from '../../src/lib/discord'
import { hashPassword, hashToken, token } from '../../src/lib/crypto'
import { POST as apiPost } from '../../src/app/api/[...path]/route'

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
  getUser: vi.fn(),
  createSession: vi.fn(),
  SESSION_COOKIE: 'drawspace_session',
}))

const origin = 'http://localhost:3311'
const prefix = `discord-test-${token().slice(0, 10).toLowerCase()}`
let sequence = 0
const fetchMock = vi.fn()
const states: string[] = []

function profile(): DiscordProfile {
  sequence++
  return {
    id: `${Date.now()}${sequence.toString().padStart(4, '0')}`,
    username: 'Discord Tester',
    global_name: 'Discord Tester',
    email: `${prefix}-${sequence}@example.com`,
    verified: true,
  }
}

async function localUser() {
  const person = profile()
  const [user] = await sql`
    INSERT INTO users (name, email, password_hash) VALUES (${person.username}, ${person.email}, ${await hashPassword('test-password-only')})
    RETURNING id, name, email
  `
  return {
    id: user.id as string,
    name: user.name as string,
    email: user.email as string,
  }
}

async function begin(link = false) {
  const response = await startDiscord(
    new NextRequest(`${origin}/api/auth/discord`, {
      method: link ? 'POST' : 'GET',
      headers: { origin },
    }),
  )
  const url = new URL(response.headers.get('location')!)
  const state = url.searchParams.get('state')!
  expect(state).toBeTruthy()
  states.push(hashToken(state))
  const browser = response.cookies.get('drawspace_discord')!.value
  cookieJar.set('drawspace_discord', browser)
  return { state, browser, response, url }
}

function callback(state: string, extra: Record<string, string> = {}) {
  const url = new URL('/api/auth/discord/callback', origin)
  url.search = new URLSearchParams({
    state,
    code: 'authorization-code',
    iss: 'https://discord.com',
    ...extra,
  }).toString()
  return finishDiscord(new NextRequest(url))
}

function provider(person: DiscordProfile) {
  fetchMock
    .mockResolvedValueOnce(
      Response.json({
        access_token: 'private-provider-token',
        token_type: 'Bearer',
        scope: 'identify email',
      }),
    )
    .mockResolvedValueOnce(Response.json(person))
}

function post(path: string, data: unknown) {
  return apiPost(
    new NextRequest(`${origin}/api/${path}`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(data),
    }),
    { params: Promise.resolve({ path: path.split('/') }) },
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
  vi.mocked(getUser).mockReset().mockResolvedValue(null)
  vi.mocked(createSession).mockReset()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
afterAll(async () => {
  await sql`DELETE FROM discord_auth_requests WHERE state_hash IN ${sql(states)}`
  await sql`DELETE FROM workspaces WHERE id IN (SELECT m.workspace_id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.email LIKE ${`${prefix}%`})`
  await sql`DELETE FROM users WHERE email LIKE ${`${prefix}%`}`
  await sql.end()
})

describe('Discord authorization requests', () => {
  it('stores hashed state/browser binding and a ten-minute verifier; secure cookies follow configuration', async () => {
    vi.stubEnv('COOKIE_SECURE', 'true')
    const { state, browser, response, url } = await begin()
    const [flow] =
      await sql`SELECT *, expires_at - now() AS ttl FROM discord_auth_requests WHERE state_hash = ${hashToken(state)}`
    expect(flow.browser_hash).toBe(hashToken(browser))
    expect(flow.browser_hash).not.toBe(browser)
    expect(flow.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(flow.link_user_id).toBeNull()
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(new Date(flow.expires_at).getTime() - Date.now()).toBeGreaterThan(
      590000,
    )
    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=lax')
    expect(cookie).toContain('Max-Age=600')
    expect(cookie).toContain('Path=/api/auth/discord')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('signs up once, creates an owner workspace, issues an ordinary app session, and rejects callback replay', async () => {
    const person = profile()
    const { state } = await begin()
    provider(person)
    const response = await callback(state)
    expect(response.headers.get('location')).toBe(`${origin}/app`)
    expect(response.cookies.get('drawspace_discord')?.value).toBe('')
    const [user] =
      await sql`SELECT * FROM users WHERE discord_id = ${person.id}`
    expect(user.password_hash).toBeNull()
    expect(user.email).toBe(person.email)
    expect(createSession).toHaveBeenCalledWith(user.id)
    const members =
      await sql`SELECT * FROM memberships WHERE user_id = ${user.id}`
    expect(members).toHaveLength(1)
    expect(members[0].role).toBe('owner')
    const replay = await callback(state)
    expect(replay.headers.get('location')).toBe(
      `${origin}/login?discord_error=state`,
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each(['missing-cookie', 'wrong-browser', 'wrong-state', 'expired'])(
    'rejects %s before contacting Discord',
    async (scenario) => {
      const { state } = await begin()
      if (scenario === 'missing-cookie') cookieJar.clear()
      if (scenario === 'wrong-browser')
        cookieJar.set('drawspace_discord', token())
      if (scenario === 'expired')
        await sql`UPDATE discord_auth_requests SET expires_at = now() - interval '1 second' WHERE state_hash = ${hashToken(state)}`
      const response = await callback(
        scenario === 'wrong-state' ? token() : state,
      )
      expect(response.headers.get('location')).toBe(
        `${origin}/login?discord_error=state`,
      )
      expect(createSession).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    [{ error: 'access_denied' }, 'denied'],
    [{ iss: 'https://attacker.example' }, 'state'],
    [{ code: '' }, 'failed'],
  ] as const)(
    'handles provider denial, issuer mix-up, or missing code and consumes state',
    async (params, error) => {
      const { state } = await begin()
      const response = await callback(state, params)
      expect(response.headers.get('location')).toBe(
        `${origin}/login?discord_error=${error}`,
      )
      expect(
        await sql`SELECT * FROM discord_auth_requests WHERE state_hash = ${hashToken(state)}`,
      ).toHaveLength(0)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('does not expose provider errors or issue sessions on failure', async () => {
    const { state } = await begin()
    fetchMock.mockRejectedValueOnce(
      new Error('private token and client secret'),
    )
    const response = await callback(state)
    expect(response.headers.get('location')).toBe(
      `${origin}/login?discord_error=failed`,
    )
    expect(createSession).not.toHaveBeenCalled()
  })

  it('replaces an earlier browser flow and atomically allows only one concurrent callback', async () => {
    const first = await begin()
    const second = await begin()
    expect(
      await sql`SELECT * FROM discord_auth_requests WHERE state_hash = ${hashToken(first.state)}`,
    ).toHaveLength(0)
    provider(profile())
    const responses = await Promise.all([
      callback(second.state),
      callback(second.state),
    ])
    expect(
      responses.map((response) => response.headers.get('location')).sort(),
    ).toEqual([`${origin}/app`, `${origin}/login?discord_error=state`])
    expect(createSession).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('disables the start and callback when credentials are absent', async () => {
    vi.stubEnv('DISCORD_CLIENT_SECRET', '')
    const response = await startDiscord(
      new NextRequest(`${origin}/api/auth/discord`),
    )
    expect(response.headers.get('location')).toBe(
      `${origin}/login?discord_error=disabled`,
    )
    expect((await callback(token())).headers.get('location')).toBe(
      `${origin}/login?discord_error=disabled`,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires an authenticated same-origin POST to link; GET never links a logged-in user', async () => {
    const denied = await startDiscord(
      new NextRequest(`${origin}/api/auth/discord`, {
        method: 'POST',
        headers: { origin: 'https://attacker.example' },
      }),
    )
    expect(denied.status).toBe(403)
    const anonymous = await startDiscord(
      new NextRequest(`${origin}/api/auth/discord`, {
        method: 'POST',
        headers: { origin },
      }),
    )
    expect(anonymous.status).toBe(401)
    vi.mocked(getUser).mockResolvedValue(await localUser())
    expect(
      (
        await startDiscord(new NextRequest(`${origin}/api/auth/discord`))
      ).headers.get('location'),
    ).toBe(`${origin}/app`)
  })

  it('links explicitly to the initiating signed-in account even with registration disabled', async () => {
    const user = await localUser()
    const person = profile()
    vi.mocked(getUser).mockResolvedValue(user)
    vi.stubEnv('ALLOW_REGISTRATION', 'false')
    const { state } = await begin(true)
    provider(person)
    expect((await callback(state)).headers.get('location')).toBe(
      `${origin}/app/settings?discord_connected=true`,
    )
    const [linked] = await sql`SELECT * FROM users WHERE id = ${user.id}`
    expect(linked.discord_id).toBe(person.id)
    expect(linked.email).toBe(user.email)
    expect(linked.password_hash).not.toBeNull()
    expect(createSession).toHaveBeenCalledWith(user.id)
  })

  it.each(['signed-out', 'different-user', 'login-became-authenticated'])(
    'rejects callbacks after session changes: %s',
    async (scenario) => {
      const user = await localUser()
      if (scenario !== 'login-became-authenticated')
        vi.mocked(getUser).mockResolvedValue(user)
      const { state } = await begin(scenario !== 'login-became-authenticated')
      vi.mocked(getUser).mockResolvedValue(
        scenario === 'signed-out' ? null : await localUser(),
      )
      const response = await callback(state)
      expect(response.headers.get('location')).toContain('discord_error=state')
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )
})

describe('Discord account policy and compatibility', () => {
  it('blocks new accounts with registration disabled, but permits existing logins by stable Discord ID', async () => {
    const person = profile()
    const user = await resolveDiscordUser(person, null)
    vi.stubEnv('ALLOW_REGISTRATION', 'false')
    expect(
      await resolveDiscordUser(
        { ...person, email: 'changed@example.com' },
        null,
      ),
    ).toEqual(user)
    await expect(resolveDiscordUser(profile(), null)).rejects.toMatchObject({
      code: 'registration',
    })
  })

  it('never automatically links matching emails', async () => {
    const user = await localUser()
    const person = { ...profile(), email: user.email }
    await expect(resolveDiscordUser(person, null)).rejects.toMatchObject({
      code: 'account_exists',
    })
    expect(
      (await sql`SELECT discord_id FROM users WHERE id = ${user.id}`)[0]
        .discord_id,
    ).toBeNull()
    expect((await resolveDiscordUser(person, user.id)).id).toBe(user.id)
  })

  it('prevents one provider identity linking to two accounts and an account replacing its identity', async () => {
    const first = await localUser()
    const second = await localUser()
    const person = profile()
    await resolveDiscordUser(person, first.id)
    await expect(resolveDiscordUser(person, second.id)).rejects.toMatchObject({
      code: 'linked',
    })
    await expect(resolveDiscordUser(profile(), first.id)).rejects.toMatchObject(
      { code: 'linked' },
    )
  })

  it('serializes concurrent signups into one user and workspace', async () => {
    const person = profile()
    const users = await Promise.all([
      resolveDiscordUser(person, null),
      resolveDiscordUser(person, null),
    ])
    expect(users[0]).toEqual(users[1])
    expect(
      await sql`SELECT * FROM memberships WHERE user_id = ${users[0].id}`,
    ).toHaveLength(1)
  })

  it('supports long Discord display names when creating the default workspace', async () => {
    const user = await resolveDiscordUser(
      { ...profile(), global_name: 'x'.repeat(80) },
      null,
    )
    expect(user.name).toHaveLength(80)
  })

  it('rejects password sign-in and password changes for Discord-only users without server errors', async () => {
    const user = await resolveDiscordUser(profile(), null)
    const login = await post('auth/login', {
      email: user.email,
      password: 'any-password',
    })
    expect(login.status).toBe(401)
    vi.mocked(getUser).mockResolvedValue(user)
    const change = await post('account/password', {
      currentPassword: 'any-password',
      password: 'new-long-password',
    })
    expect(change.status).toBe(400)
    expect((await change.json()).error).toContain('no password')
  })

  it('preserves local password login after linking', async () => {
    const user = await localUser()
    await resolveDiscordUser(profile(), user.id)
    const login = await post('auth/login', {
      email: user.email,
      password: 'test-password-only',
    })
    expect(login.status).toBe(200)
    expect(createSession).toHaveBeenCalledWith(user.id)
  })
})
