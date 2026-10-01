import { z } from 'zod'

export const idSchema = z.uuid()
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Please enter a name')
  .max(80)
export const titleSchema = z.string().trim().min(1).max(160)
export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase())
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
export const roleSchema = z.enum(['admin', 'editor', 'viewer'])
const binaryFileSchema = z.object({
  id: z.string().min(1).max(100),
  mimeType: z.enum([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/avif',
    'image/bmp',
    'image/x-icon',
    'application/octet-stream',
  ]),
  // Reject remote image URLs so shared drawings cannot embed tracking requests.
  dataURL: z
    .string()
    .regex(/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i),
  created: z.number().finite(),
  lastRetrieved: z.number().finite().optional(),
  version: z.number().finite().optional(),
})
export const sceneSchema = z.object({
  elements: z.array(z.record(z.string(), z.json())).max(20000),
  appState: z.record(z.string(), z.json()),
  files: z.record(z.string(), binaryFileSchema),
})
export const saveSchema = z.object({
  version: z.number().int().positive(),
  title: titleSchema.optional(),
  scene: sceneSchema.optional(),
  thumbnail: z
    .string()
    .max(300000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
    .nullable()
    .optional(),
})
