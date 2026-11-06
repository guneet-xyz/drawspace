import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSession, getUser } from '@/lib/auth'
import { hashToken, token } from '@/lib/crypto'
import { sql } from '@/lib/db'
import {
  appOrigin,
  DiscordError,
  discordAuthorizationUrl,
  discordEnabled,
  getDiscordProfile,
  resolveDiscordUser,
} from '@/lib/discord'

const FLOW_COOKIE = 'drawspace_discord'
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'lax' as const,
  path: '/api/auth/discord',
  maxAge: 600,
})
const redirect = (path: string | URL) => {
  const response = NextResponse.redirect(new URL(path, appOrigin()), 303)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

export async function startDiscord(req: NextRequest) {
  const linking = req.method === 'POST'
  // Linking is an authenticated, same-origin action, not an automatic email match.
  if (linking && req.headers.get('origin') !== appOrigin())
    return NextResponse.json(
      { error: 'Request origin is not allowed.' },
      { status: 403 },
    )
  if (!discordEnabled()) return redirect('/login?discord_error=disabled')
  const user = await getUser()
  if (linking && !user)
    return NextResponse.json(
      { error: 'Please sign in to continue.' },
      { status: 401 },
    )
  if (!linking && user) return redirect('/app')
  const state = token()
  const browser = token()
  const verifier = token()
  const previous = (await cookies()).get(FLOW_COOKIE)?.value
  await sql`DELETE FROM discord_auth_requests WHERE expires_at < now() ${previous ? sql`OR browser_hash = ${hashToken(previous)}` : sql``}`
  await sql`
    INSERT INTO discord_auth_requests (state_hash, browser_hash, code_verifier, link_user_id)
    VALUES (${hashToken(state)}, ${hashToken(browser)}, ${verifier}, ${linking ? user!.id : null})
  `
  const response = redirect(discordAuthorizationUrl(state, verifier))
  response.cookies.set(FLOW_COOKIE, browser, cookieOptions())
  return response
}

export async function finishDiscord(req: NextRequest) {
  let linking = false
  let response: NextResponse
  try {
    if (!discordEnabled()) throw new DiscordError('disabled')
    const browser = (await cookies()).get(FLOW_COOKIE)?.value
    const state = req.nextUrl.searchParams.get('state')
    if (!browser || !state || !/^[A-Za-z0-9_-]{43}$/.test(state))
      throw new DiscordError('state')
    // Consume atomically before exchanging the code, including on provider denial.
    const [flow] = await sql<
      { code_verifier: string; link_user_id: string | null }[]
    >`
      DELETE FROM discord_auth_requests
      WHERE state_hash = ${hashToken(state)} AND browser_hash = ${hashToken(browser)} AND expires_at > now()
      RETURNING code_verifier, link_user_id
    `
    if (!flow) throw new DiscordError('state')
    linking = Boolean(flow.link_user_id)
    const user = await getUser()
    if ((linking && user?.id !== flow.link_user_id) || (!linking && user))
      throw new DiscordError('state')
    const issuer = req.nextUrl.searchParams.get('iss')
    if (issuer && issuer !== 'https://discord.com')
      throw new DiscordError('state')
    if (req.nextUrl.searchParams.has('error')) throw new DiscordError('denied')
    const code = req.nextUrl.searchParams.get('code')
    if (!code || code.length > 2048) throw new DiscordError('failed')
    const profile = await getDiscordProfile(code, flow.code_verifier)
    const account = await resolveDiscordUser(profile, flow.link_user_id)
    await createSession(account.id)
    response = redirect(
      linking ? '/app/settings?discord_connected=true' : '/app',
    )
  } catch (error) {
    const code =
      error instanceof DiscordError
        ? error.code
        : error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === '23505'
          ? 'account_exists'
          : 'failed'
    // Do not log provider responses, codes, tokens, or credential-bearing fetch errors.
    response = redirect(
      `${linking ? '/app/settings' : '/login'}?discord_error=${code}`,
    )
  }
  response.cookies.set(FLOW_COOKIE, '', { ...cookieOptions(), maxAge: 0 })
  return response
}
