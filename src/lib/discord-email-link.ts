import 'server-only'
import { sql } from '@/lib/db'
import { hashToken, token } from '@/lib/crypto'
import { appOrigin, DiscordError, type DiscordProfile } from '@/lib/discord'
import {
  consumeEmailQuota,
  LINK_TOKEN as TOKEN,
  plainText as plain,
} from '@/lib/email-links'
import { sendEmail } from '@/lib/mail'
import { consumeRateLimit } from '@/lib/rate-limit'
import type { User } from '@/lib/types'

export async function requestDiscordEmailLink(
  userId: string,
  profile: DiscordProfile,
) {
  const [user] = await sql<{ name: string; email: string }[]>`
    SELECT name, email FROM users
    WHERE id = ${userId} AND email = ${profile.email} AND discord_id IS NULL
  `
  if (!user) throw new DiscordError('linked')
  if (
    !(await consumeRateLimit(`discord-link-email:${userId}`, 3, 3600)) ||
    !(await consumeEmailQuota())
  )
    throw new DiscordError('email_limit')
  const value = token()
  const discordName =
    plain(profile.global_name || profile.username).slice(0, 80) || 'Discord'
  await sql.begin(async (tx) => {
    // Only the newest link for an account remains valid.
    await tx`DELETE FROM discord_link_requests WHERE user_id = ${userId} OR expires_at < now()`
    await tx`
      INSERT INTO discord_link_requests (token_hash, user_id, discord_id, discord_name, email)
      VALUES (${hashToken(value)}, ${userId}, ${profile.id}, ${discordName}, ${user.email})
    `
  })
  try {
    await sendEmail({
      to: user.email,
      subject: 'Connect Discord to your Drawspace account',
      text: [
        `Hi ${plain(user.name)},`,
        '',
        `Someone signed in to Drawspace with the Discord account "${discordName}", which uses this email address.`,
        'To connect that Discord account to your existing Drawspace account, open this link within 30 minutes:',
        '',
        `${appOrigin()}/auth/discord/confirm?token=${value}`,
        '',
        'Connecting signs out your other Drawspace sessions. Afterwards you can sign in with Discord.',
        '',
        "If this wasn't you, ignore this email. Nothing will change.",
      ].join('\n'),
    })
  } catch {
    await sql`DELETE FROM discord_link_requests WHERE token_hash = ${hashToken(value)}`
    // Provider errors can include request metadata; never log them verbatim.
    throw new DiscordError('email_failed')
  }
}

export async function getDiscordEmailLink(value: string | undefined) {
  if (!value || !TOKEN.test(value)) return null
  const [request] = await sql<
    {
      name: string
      email: string
      discord_name: string
      has_password: boolean
    }[]
  >`
    SELECT u.name, u.email, r.discord_name, u.password_hash IS NOT NULL AS has_password
    FROM discord_link_requests r JOIN users u ON u.id = r.user_id
    WHERE r.token_hash = ${hashToken(value)} AND r.expires_at > now()
      AND u.email = r.email AND u.discord_id IS NULL
  `
  return request ?? null
}

export async function confirmDiscordEmailLink(
  value: string,
  disablePassword: boolean,
): Promise<User> {
  if (!TOKEN.test(value)) throw new DiscordError('link_expired')
  // Consume first so a token can never be used twice, even if linking fails.
  const [request] = await sql<
    { user_id: string; discord_id: string; email: string }[]
  >`
    DELETE FROM discord_link_requests
    WHERE token_hash = ${hashToken(value)} AND expires_at > now()
    RETURNING user_id, discord_id, email
  `
  if (!request) throw new DiscordError('link_expired')
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${request.discord_id}, 0))`
    const [target] = await tx<{ email: string; discord_id: string | null }[]>`
      SELECT email, discord_id FROM users WHERE id = ${request.user_id} FOR UPDATE
    `
    if (!target || target.email !== request.email)
      throw new DiscordError('link_expired')
    const [owner] =
      await tx`SELECT id FROM users WHERE discord_id = ${request.discord_id}`
    if (target.discord_id || owner) throw new DiscordError('linked')
    const [user] = await tx<User[]>`
      UPDATE users SET discord_id = ${request.discord_id},
        email_verified_at = coalesce(email_verified_at, now())
      WHERE id = ${request.user_id}
      RETURNING id, name, email
    `
    // Whoever registered this unverified email may have set the password, so
    // the mailbox owner can remove it.
    if (disablePassword)
      await tx`UPDATE users SET password_hash = NULL WHERE id = ${user.id}`
    await tx`DELETE FROM sessions WHERE user_id = ${user.id}`
    await tx`DELETE FROM discord_link_requests WHERE user_id = ${user.id}`
    return user
  })
}
