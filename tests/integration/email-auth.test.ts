import { NextRequest } from "next/server"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { POST as apiPost } from "../../src/app/api/[...path]/route"
import { createSession } from "../../src/lib/auth"
import {
  hashPassword,
  hashToken,
  token,
  verifyPassword,
} from "../../src/lib/crypto"
import { sql } from "../../src/lib/db"
import { resolveDiscordUser } from "../../src/lib/discord"
import { getEmailLink } from "../../src/lib/email-auth"
import { mailEnabled, sendEmail } from "../../src/lib/mail"

vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set() {}, delete() {} }),
}))
vi.mock("@/lib/auth", () => ({
  getUser: vi.fn(async () => null),
  createSession: vi.fn(),
  SESSION_COOKIE: "drawspace_session",
}))
vi.mock("@/lib/mail", () => ({ mailEnabled: vi.fn(), sendEmail: vi.fn() }))

const origin = "http://localhost:3314"
const prefix = `email-auth-test-${token().slice(0, 10).toLowerCase()}`
let sequence = 0
const oldPassword = "old-password-only"

function address() {
  sequence++
  return `${prefix}-${sequence}@example.com`
}

async function user(options: { password?: boolean; verified?: boolean } = {}) {
  const { password = true, verified = false } = options
  const [row] = await sql<{ id: string; email: string }[]>`
    INSERT INTO users (name, email, password_hash, email_verified_at)
    VALUES ('Email Person', ${address()},
      ${password ? await hashPassword(oldPassword) : null},
      ${verified ? new Date() : null})
    RETURNING id, email
  `
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${hashToken(token())}, ${row.id}, now() + interval '1 day')`
  return row
}

async function account(id: string) {
  const [row] = await sql<
    {
      password_hash: string | null
      email_verified_at: Date | null
      sessions: number
    }[]
  >`
    SELECT password_hash, email_verified_at,
      (SELECT count(*)::int FROM sessions WHERE user_id = ${id}) AS sessions
    FROM users WHERE id = ${id}
  `
  return row
}

function post(path: string, data: unknown, requestOrigin = origin) {
  return apiPost(
    new NextRequest(`${origin}/api/${path}`, {
      method: "POST",
      headers: { origin: requestOrigin, "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
    { params: Promise.resolve({ path: path.split("/") }) },
  )
}

function emailed(path: string, call = -1) {
  const text = vi.mocked(sendEmail).mock.calls.at(call)![0].text
  const link = new URL(text.match(/https?:\/\/\S+/)![0])
  expect(link.origin + link.pathname).toBe(`${origin}${path}`)
  return link.searchParams.get("token")!
}

async function requestLink(
  kind: "password-reset" | "email-sign-in",
  email: string,
) {
  const response = await post(`auth/${kind}`, { email })
  expect(response.status).toBe(200)
  return emailed(
    kind === "password-reset" ? "/reset-password" : "/auth/email/confirm",
  )
}

beforeEach(() => {
  vi.stubEnv("APP_URL", origin)
  vi.mocked(createSession).mockReset()
  vi.mocked(mailEnabled).mockReset().mockReturnValue(true)
  vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => {
  await sql`DELETE FROM rate_limits WHERE key LIKE 'email-%'`
  await sql`DELETE FROM users WHERE email LIKE ${`${prefix}%`}`
  await sql.end()
})

describe("email link requests", () => {
  it("responds identically whether or not an account exists", async () => {
    const existing = await user()
    const known = await post("auth/password-reset", { email: existing.email })
    const unknown = await post("auth/password-reset", { email: address() })
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(await known.json()).toEqual(await unknown.json())
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe(existing.email)
  })

  it("stores only a hash of the token and keeps links non-consuming until confirmed", async () => {
    const existing = await user()
    const value = await requestLink("password-reset", existing.email)
    const [row] =
      await sql`SELECT * FROM email_tokens WHERE user_id = ${existing.id}`
    expect(row.token_hash).toBe(hashToken(value))
    expect(row.purpose).toBe("password_reset")
    for (let i = 0; i < 2; i++)
      expect(await getEmailLink("password_reset", value)).toEqual({
        email: existing.email,
        has_password: true,
        verified: false,
      })
    expect(await getEmailLink("sign_in", value)).toBeNull()
    expect(await getEmailLink("password_reset", "nope")).toBeNull()
  })

  it("limits requests per address, even for addresses without an account", async () => {
    for (const email of [(await user()).email, address()]) {
      for (let i = 0; i < 3; i++)
        expect((await post("auth/email-sign-in", { email })).status).toBe(200)
      expect((await post("auth/email-sign-in", { email })).status).toBe(429)
    }
  })

  it("reports delivery failure and discards the unsent link", async () => {
    const existing = await user()
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("provider detail"))
    const response = await post("auth/email-sign-in", { email: existing.email })
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain("provider")
    expect(
      await sql`SELECT 1 FROM email_tokens WHERE user_id = ${existing.id}`,
    ).toHaveLength(0)
  })

  it("is unavailable without email delivery or from another origin", async () => {
    vi.mocked(mailEnabled).mockReturnValue(false)
    expect(
      (await post("auth/password-reset", { email: address() })).status,
    ).toBe(404)
    vi.mocked(mailEnabled).mockReturnValue(true)
    expect(
      (
        await post(
          "auth/password-reset",
          { email: address() },
          "https://attacker.example",
        )
      ).status,
    ).toBe(403)
  })
})

describe("password reset", () => {
  it("sets a new password, signs out everywhere and invalidates other links", async () => {
    const existing = await user()
    const signIn = await requestLink("email-sign-in", existing.email)
    const value = await requestLink("password-reset", existing.email)
    const weak = await post("auth/password-reset/confirm", {
      token: value,
      password: "short",
    })
    expect(weak.status).toBe(400)
    expect(await getEmailLink("password_reset", value)).not.toBeNull()

    const response = await post("auth/password-reset/confirm", {
      token: value,
      password: "brand-new-password",
    })
    expect(response.status).toBe(200)
    expect(createSession).toHaveBeenCalledWith(existing.id)
    const after = await account(existing.id)
    expect(
      await verifyPassword("brand-new-password", after.password_hash!),
    ).toBe(true)
    expect(await verifyPassword(oldPassword, after.password_hash!)).toBe(false)
    expect(after.sessions).toBe(0)
    expect(after.email_verified_at).not.toBeNull()
    expect(await getEmailLink("sign_in", signIn)).toBeNull()

    const replay = await post("auth/password-reset/confirm", {
      token: value,
      password: "another-new-password",
    })
    expect(replay.status).toBe(400)
  })

  it("lets a Discord-only account add a password", async () => {
    const existing = await user({ password: false, verified: true })
    const value = await requestLink("password-reset", existing.email)
    expect(
      (
        await post("auth/password-reset/confirm", {
          token: value,
          password: "first-ever-password",
        })
      ).status,
    ).toBe(200)
    expect((await account(existing.id)).password_hash).not.toBeNull()
  })

  it("rejects superseded, expired and wrong-purpose links", async () => {
    const existing = await user()
    const first = await requestLink("password-reset", existing.email)
    const second = await requestLink("password-reset", existing.email)
    const signIn = await requestLink("email-sign-in", existing.email)
    await sql`UPDATE email_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = ${hashToken(second)}`
    for (const value of [first, second, signIn])
      expect(
        (
          await post("auth/password-reset/confirm", {
            token: value,
            password: "brand-new-password",
          })
        ).status,
      ).toBe(400)
    expect(
      await verifyPassword(
        oldPassword,
        (await account(existing.id)).password_hash!,
      ),
    ).toBe(true)
    expect(createSession).not.toHaveBeenCalled()
  })
})

describe("email sign-in", () => {
  it("first verification signs out other sessions and keeps the password by default", async () => {
    const existing = await user()
    const value = await requestLink("email-sign-in", existing.email)
    expect(await getEmailLink("sign_in", value)).toMatchObject({
      verified: false,
      has_password: true,
    })
    const response = await post("auth/email-sign-in/confirm", { token: value })
    expect(response.status).toBe(200)
    expect(createSession).toHaveBeenCalledWith(existing.id)
    const after = await account(existing.id)
    expect(after.sessions).toBe(0)
    expect(after.email_verified_at).not.toBeNull()
    expect(after.password_hash).not.toBeNull()
    expect(
      (await post("auth/email-sign-in/confirm", { token: value })).status,
    ).toBe(400)
  })

  it("can turn off the password on first verification", async () => {
    const existing = await user()
    const value = await requestLink("email-sign-in", existing.email)
    await post("auth/email-sign-in/confirm", {
      token: value,
      disablePassword: true,
    })
    expect((await account(existing.id)).password_hash).toBeNull()
  })

  it("leaves verified accounts’ sessions and password alone", async () => {
    const existing = await user({ verified: true })
    const value = await requestLink("email-sign-in", existing.email)
    await post("auth/email-sign-in/confirm", {
      token: value,
      disablePassword: true,
    })
    const after = await account(existing.id)
    expect(after.sessions).toBe(1)
    expect(after.password_hash).not.toBeNull()
    expect(createSession).toHaveBeenCalledWith(existing.id)
  })

  it("does not accept a reset link and allows only one concurrent use", async () => {
    const existing = await user()
    const reset = await requestLink("password-reset", existing.email)
    expect(
      (await post("auth/email-sign-in/confirm", { token: reset })).status,
    ).toBe(400)
    const value = await requestLink("email-sign-in", existing.email)
    const results = await Promise.all([
      post("auth/email-sign-in/confirm", { token: value }),
      post("auth/email-sign-in/confirm", { token: value }),
    ])
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 400,
    ])
    expect(createSession).toHaveBeenCalledTimes(1)
  })
})

describe("verified email tracking", () => {
  it("marks accounts created through Discord as verified", async () => {
    vi.stubEnv("ALLOW_REGISTRATION", "true")
    const created = await resolveDiscordUser(
      {
        id: `${Date.now()}${sequence}`,
        username: "discord_person",
        global_name: null,
        email: address(),
        verified: true,
      },
      null,
    )
    expect((await account(created.id)).email_verified_at).not.toBeNull()
    await sql`DELETE FROM workspaces WHERE id IN (SELECT workspace_id FROM memberships WHERE user_id = ${created.id})`
  })
})
