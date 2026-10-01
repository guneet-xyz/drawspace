import { describe, expect, it } from 'vitest'
import {
  emailSchema,
  passwordSchema,
  roleSchema,
  saveSchema,
  sceneSchema,
} from '../../src/lib/validation'

describe('request validation', () => {
  it('rejects remote image URLs in saved scenes', () => {
    expect(
      sceneSchema.safeParse({
        elements: [],
        appState: {},
        files: {
          track: {
            id: 'track',
            mimeType: 'image/png',
            dataURL: 'https://tracker.example/pixel.png',
            created: 1,
          },
        },
      }).success,
    ).toBe(false)
  })
  it('normalizes emails', () =>
    expect(emailSchema.parse('Me@Example.com')).toBe('me@example.com'))
  it('requires strong-enough passwords', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false)
    expect(passwordSchema.safeParse('long-enough-password').success).toBe(true)
  })
  it('does not accept an owner role from clients', () =>
    expect(roleSchema.safeParse('owner').success).toBe(false))
  it('requires a version for optimistic concurrency', () => {
    expect(saveSchema.safeParse({ title: 'Changed' }).success).toBe(false)
    expect(saveSchema.safeParse({ version: 1, title: 'Changed' }).success).toBe(
      true,
    )
  })
  it('only accepts PNG data URLs for thumbnails', () => {
    expect(
      saveSchema.safeParse({
        version: 1,
        thumbnail: 'data:image/svg+xml,<svg onload="evil()" />',
      }).success,
    ).toBe(false)
    expect(
      saveSchema.safeParse({
        version: 1,
        thumbnail: 'data:image/png;base64,aGVsbG8=',
      }).success,
    ).toBe(true)
  })
})
