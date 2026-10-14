import { z } from 'zod'
import { type DiffTarget, DiffTargetSchema, FileStatusSchema } from './git'

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
  'stale',
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

const RepoPath = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith('/') && !path.split('/').includes('..'), 'path must stay inside the repo')

const WriteFileSchema = z.object({
  path: RepoPath,
  oldPath: RepoPath.nullable(),
  status: FileStatusSchema,
  newSha: z.string().nullable(),
})

export const WriteRequestSchema = z.union([
  z.object({
    action: z.enum(['stage-hunk', 'unstage-hunk', 'discard-hunk']),
    file: WriteFileSchema,
    hunkIndex: z.number().int().min(0),
    hunkHeader: z.string().startsWith('@@ '),
  }),
  z.object({ action: z.enum(['stage-file', 'unstage-file', 'discard-file']), file: WriteFileSchema }),
])
export type WriteRequest = z.infer<typeof WriteRequestSchema>
export type WriteAction = WriteRequest['action']

export const UndoResultSchema = z.object({ restored: z.array(z.string()).nullable() })
export type UndoResult = z.infer<typeof UndoResultSchema>
