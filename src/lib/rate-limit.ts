import 'server-only'
import { sql } from '@/lib/db'

/** Counts an attempt and returns false once `max` attempts occur in the window. */
export async function consumeRateLimit(
  key: string,
  max: number,
  seconds: number,
) {
  const [row] = await sql`
    INSERT INTO rate_limits (key, attempts, resets_at) VALUES (${key}, 1, now() + ${seconds} * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN rate_limits.resets_at < now() THEN 1 ELSE rate_limits.attempts + 1 END,
      resets_at = CASE WHEN rate_limits.resets_at < now() THEN now() + ${seconds} * interval '1 second' ELSE rate_limits.resets_at END
    RETURNING attempts
  `
  await sql`DELETE FROM rate_limits WHERE resets_at < now() - interval '1 day'`
  return row.attempts <= max
}
