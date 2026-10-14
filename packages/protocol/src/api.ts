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

export const RepoInfoSchema = z.object({ root: z.string(), branch: z.string().nullable(), head: z.string().nullable() })
export type RepoInfo = z.infer<typeof RepoInfoSchema>
