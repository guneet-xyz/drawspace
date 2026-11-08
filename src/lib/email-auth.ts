import 'server-only'
import type { TransactionSql } from 'postgres'
import { sql } from '@/lib/db'
import { hashPassword, hashToken, token } from '@/lib/crypto'
import { appOrigin } from '@/lib/discord'
import { consumeEmailQuota, LINK_TOKEN, plainText } from '@/lib/email-links'
import { sendEmail } from '@/lib/mail'
import { consumeRateLimit } from '@/lib/rate-limit'
import type { User } from '@/lib/types'

export type EmailLinkPurpose = 'sign_in' | 'password_reset'

export const LINK_MINUTES: Record<EmailLinkPurpose, number> = {
  sign_in: 15,
  password_reset: 30,
}

const LINKS: Record<
  EmailLinkPurpose,
  { path: string; subject: string; lines: string[] }
> = {
  sign_in: {
    path: '/auth/email/confirm',
    subject: 'Your Drawspace sign-in link',
    lines: [
      `Use this link to sign in to Drawspace within ${LINK_MINUTES.sign_in} minutes:`,
    ],
  },
  password_reset: {
    path: '/reset-password',
    subject: 'Reset your Drawspace password',
    lines: [
      `Use this link to choose a new Drawspace password within ${LINK_MINUTES.password_reset} minutes:`,
    ],
  },
}

/**
 * Emails a single-use link to an existing account. The per-address limit is
 * applied whether or not an account exists, so it doesn't reveal accounts.
 */
export async function requestEmailLink(
  purpose: EmailLinkPurpose,
  email: string,
): Promise<'sent' | 'no_account' | 'limited' | 'failed'> {
  if (
    !(await consumeRateLimit(
      `email-request:${purpose}:${hashToken(email)}`,
      3,
      3600,
    ))
  )
    return 'limited'
  const [user] = await sql<{ id: string; name: string; email: string }[]>`
    SELECT id, name, email FROM users WHERE email = ${email}
  `
  if (!user) return 'no_account'
  if (!(await consumeEmailQuota())) return 'limited'
  const value = token()
  await sql.begin(async (tx) => {
    // Only the newest link of each kind remains valid.
    await tx`DELETE FROM email_tokens WHERE (user_id = ${user.id} AND purpose = ${purpose}) OR expires_at < now()`
    await tx`
      INSERT INTO email_tokens (token_hash, purpose, user_id, email, expires_at)
      VALUES (${hashToken(value)}, ${purpose}, ${user.id}, ${user.email},
        now() + ${LINK_MINUTES[purpose]} * interval '1 minute')
    `
  })
  const link = LINKS[purpose]
  try {
    await sendEmail({
      to: user.email,
      subject: link.subject,
      text: [
        `Hi ${plainText(user.name)},`,
        '',
        ...link.lines,
        '',
        `${appOrigin()}${link.path}?token=${value}`,
        '',
        "If you didn't request this, ignore this email. Nothing will change.",
      ].join('\n'),
    })
  } catch {
    await sql`DELETE FROM email_tokens WHERE token_hash = ${hashToken(value)}`
    // Provider errors can include request metadata; never log them verbatim.
    return 'failed'
  }
  return 'sent'
}

/** Reads a link without consuming it, for its confirmation page. */
export async function getEmailLink(
  purpose: EmailLinkPurpose,
  value: string | undefined,
) {
  if (!value || !LINK_TOKEN.test(value)) return null
  const [link] = await sql<
    { email: string; has_password: boolean; verified: boolean }[]
  >`
    SELECT u.email, u.password_hash IS NOT NULL AS has_password,
      u.email_verified_at IS NOT NULL AS verified
    FROM email_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ${hashToken(value)} AND t.purpose = ${purpose}
      AND t.expires_at > now() AND u.email = t.email
  `
  return link ?? null
}

function consume(tx: TransactionSql, purpose: EmailLinkPurpose, value: string) {
  return tx<{ user_id: string; email: string }[]>`
    DELETE FROM email_tokens
    WHERE token_hash = ${hashToken(value)} AND purpose = ${purpose} AND expires_at > now()
    RETURNING user_id, email
  `
}

/** Sets a new password, signs out every session and invalidates other links. */
export async function confirmPasswordReset(
  value: string,
  password: string,
): Promise<User | null> {
  if (!LINK_TOKEN.test(value)) return null
  const passwordHash = await hashPassword(password)
  return sql.begin(async (tx) => {
    const [link] = await consume(tx, 'password_reset', value)
    if (!link) return null
    const [user] = await tx<User[]>`
      UPDATE users SET password_hash = ${passwordHash},
        email_verified_at = coalesce(email_verified_at, now())
      WHERE id = ${link.user_id} AND email = ${link.email}
      RETURNING id, name, email
    `
    if (!user) return null
    await tx`DELETE FROM sessions WHERE user_id = ${user.id}`
    await tx`DELETE FROM email_tokens WHERE user_id = ${user.id}`
    return user
  })
}

/**
 * Signs in with an emailed link. The first time an address is verified, any
 * existing sessions are revoked and the mailbox owner may remove a password
 * that someone else could have set when registering the unverified address.
 */
export async function confirmEmailSignIn(
  value: string,
  disablePassword: boolean,
): Promise<User | null> {
  if (!LINK_TOKEN.test(value)) return null
  return sql.begin(async (tx) => {
    const [link] = await consume(tx, 'sign_in', value)
    if (!link) return null
    const [account] = await tx<{ verified: boolean }[]>`
      SELECT email_verified_at IS NOT NULL AS verified FROM users
      WHERE id = ${link.user_id} AND email = ${link.email} FOR UPDATE
    `
    if (!account) return null
    const [user] = await tx<User[]>`
      UPDATE users SET email_verified_at = coalesce(email_verified_at, now())
      WHERE id = ${link.user_id} RETURNING id, name, email
    `
    if (!account.verified) {
      if (disablePassword)
        await tx`UPDATE users SET password_hash = NULL WHERE id = ${user.id}`
      await tx`DELETE FROM sessions WHERE user_id = ${user.id}`
    }
    await tx`DELETE FROM email_tokens WHERE user_id = ${user.id} AND purpose = 'sign_in'`
    return user
  })
}
