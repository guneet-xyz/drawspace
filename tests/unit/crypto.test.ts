import { describe, expect, it } from 'vitest'
import {
  hashPassword,
  hashToken,
  token,
  verifyPassword,
} from '../../src/lib/crypto'

describe('credentials', () => {
  it('salts passwords and verifies with scrypt', async () => {
    const a = await hashPassword('long-password')
    const b = await hashPassword('long-password')
    expect(a).not.toBe(b)
    expect(await verifyPassword('long-password', a)).toBe(true)
    expect(await verifyPassword('wrong-password', a)).toBe(false)
    expect(await verifyPassword('anything', 'invalid')).toBe(false)
  })
  it('generates unguessable URL-safe tokens and hashes them', () => {
    const a = token()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(token()).not.toBe(a)
    expect(hashToken(a)).toHaveLength(64)
    expect(hashToken(a)).not.toBe(a)
  })
})
