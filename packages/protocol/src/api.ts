import { z } from 'zod'
import { type DiffTarget, DiffTargetSchema } from './git'

export function encodeTarget(target: DiffTarget): string {
  return encodeURIComponent(JSON.stringify(target))
}

export function decodeTarget(value: string): DiffTarget {
  return DiffTargetSchema.parse(JSON.parse(decodeURIComponent(value)))
}

export const ErrorCodeSchema = z.enum([
  'not-a-repo',
  'unknown-ref',
  'timeout',
  'failed',
  'bad-request',
  'unauthorized',
  'not-found',
])
export type ErrorCode = z.infer<typeof ErrorCodeSchema>

export const ErrorBodySchema = z.object({ error: z.object({ code: ErrorCodeSchema, message: z.string() }) })
export type ErrorBody = z.infer<typeof ErrorBodySchema>

export const HandshakeSchema = z.object({ port: z.number().int(), token: z.string(), url: z.string() })
export type Handshake = z.infer<typeof HandshakeSchema>

export const RepoInfoSchema = z.object({
  root: z.string(),
  branch: z.string().nullable(),
  head: z.string().nullable(),
  nvim: z.boolean(),
})
export type RepoInfo = z.infer<typeof RepoInfoSchema>

// Paths are repo-relative; the server refuses anything that climbs out of the repo.
export const OpenRequestSchema = z.object({
  path: z
    .string()
    .min(1)
    .refine((path) => !path.startsWith('/') && !path.split('/').includes('..'), 'path must stay inside the repo'),
  line: z.number().int().min(1).default(1),
})
export type OpenRequest = z.infer<typeof OpenRequestSchema>
