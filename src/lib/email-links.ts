import "server-only"

import { consumeRateLimit } from "@/lib/rate-limit"

/** Format of the random tokens embedded in emailed links. */
export const LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/

/** Keeps user-controlled text on one line in plain-text email. */
export const plainText = (value: string) =>
  value.replace(/[\p{Cc}\p{Cf}\u2028\u2029]+/gu, " ").trim()

/** Counts one outgoing email against the instance-wide hourly quota. */
export const consumeEmailQuota = () => consumeRateLimit("email-send", 200, 3600)
