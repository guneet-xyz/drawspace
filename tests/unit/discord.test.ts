import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  discordAuthorizationUrl,
  discordEnabled,
  getDiscordProfile,
} from "../../src/lib/discord"
import { discordErrorMessage } from "../../src/lib/discord-messages"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ sql: vi.fn() }))

const fetchMock = vi.fn()
const profile = {
  id: "123456789012345678",
  username: "testuser",
  global_name: "Test User",
  email: "TEST@example.com",
  verified: true,
}
const credentials = {
  access_token: "private-access-token",
  token_type: "Bearer",
  scope: "identify email",
}

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://draw.example.com")
  vi.stubEnv("DISCORD_CLIENT_ID", "client-id")
  vi.stubEnv("DISCORD_CLIENT_SECRET", "private-client-secret")
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("Discord provider", () => {
  it("is opt-in and needs both server-side credentials", () => {
    expect(discordEnabled()).toBe(true)
    vi.stubEnv("DISCORD_CLIENT_SECRET", "")
    expect(discordEnabled()).toBe(false)
    expect(() => discordAuthorizationUrl("state", "verifier")).toThrow(
      "not configured",
    )
    vi.stubEnv("DISCORD_CLIENT_SECRET", "secret")
    vi.stubEnv("DISCORD_CLIENT_ID", "")
    expect(discordEnabled()).toBe(false)
  })

  it("uses the configured origin, minimal scopes, state, and S256 PKCE without exposing the secret", () => {
    const url = discordAuthorizationUrl("random-state", "random-verifier")
    const params = url.searchParams
    expect(url.origin).toBe("https://discord.com")
    expect(params.get("redirect_uri")).toBe(
      "https://draw.example.com/api/auth/discord/callback",
    )
    expect(params.get("scope")).toBe("identify email")
    expect(params.get("response_type")).toBe("code")
    expect(params.get("state")).toBe("random-state")
    expect(params.get("code_challenge_method")).toBe("S256")
    expect(params.get("code_challenge")).toBe(
      createHash("sha256").update("random-verifier").digest("base64url"),
    )
    expect(url.toString()).not.toContain("private-client-secret")
    expect(url.toString()).not.toContain("random-verifier")
  })

  it("exchanges the code server-side and fetches a normalized verified profile", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json(credentials))
      .mockResolvedValueOnce(Response.json(profile))
    expect(await getDiscordProfile("auth-code", "verifier")).toEqual({
      ...profile,
      email: "test@example.com",
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("https://discord.com/api/oauth2/token")
    expect(options.method).toBe("POST")
    expect(options.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    )
    expect(Object.fromEntries(options.body)).toEqual({
      client_id: "client-id",
      client_secret: "private-client-secret",
      grant_type: "authorization_code",
      code: "auth-code",
      code_verifier: "verifier",
      redirect_uri: "https://draw.example.com/api/auth/discord/callback",
    })
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://discord.com/api/v10/users/@me",
    )
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer private-access-token",
    )
    for (const [, request] of fetchMock.mock.calls) {
      expect(request.cache).toBe("no-store")
      expect(request.redirect).toBe("error")
      expect(request.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it.each([
    { ...profile, verified: false },
    { ...profile, email: null },
    { ...profile, email: "not-an-email" },
    { ...profile, id: "not-a-snowflake" },
  ])("rejects unusable or unverified profiles", async (value) => {
    fetchMock
      .mockResolvedValueOnce(Response.json(credentials))
      .mockResolvedValueOnce(Response.json(value))
    await expect(getDiscordProfile("code", "verifier")).rejects.toThrow(
      "verified email",
    )
  })

  it("rejects missing scopes and does not request the profile", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ ...credentials, scope: "identify" }),
    )
    await expect(getDiscordProfile("code", "verifier")).rejects.toThrow(
      "verified email",
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("handles token and profile HTTP failures without including provider response details", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("secret provider response", { status: 400 }),
    )
    await expect(getDiscordProfile("code", "verifier")).rejects.toThrow(
      "could not be completed",
    )
    fetchMock
      .mockResolvedValueOnce(Response.json(credentials))
      .mockResolvedValueOnce(new Response("secret", { status: 503 }))
    await expect(getDiscordProfile("code", "verifier")).rejects.toThrow(
      "could not be completed",
    )
  })

  it("only renders whitelisted error messages", () => {
    expect(discordErrorMessage("denied")).toContain("cancelled")
    expect(discordErrorMessage("state")).toContain("expired")
    expect(discordErrorMessage("<script>")).toBeUndefined()
    expect(discordErrorMessage("toString")).toBeUndefined()
    expect(discordErrorMessage()).toBeUndefined()
  })
})
