import { z } from 'zod'
import { type DiffTarget, DiffTargetSchema, FileStatusSchema, RepoPathSchema } from './git'

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

export const OpenRequestSchema = z.object({ path: RepoPathSchema, line: z.number().int().min(1).default(1) })
export type OpenRequest = z.infer<typeof OpenRequestSchema>

const WriteFileSchema = z.object({
  path: RepoPathSchema,
  oldPath: RepoPathSchema.nullable(),
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

export const FileContentsSchema = z.object({ text: z.string().nullable(), size: z.number(), binary: z.boolean() })
export type FileContents = z.infer<typeof FileContentsSchema>

export const NavigateRequestSchema = z.object({ target: DiffTargetSchema })
export const NavigateResultSchema = z.object({ pages: z.number().int() })

export const UndoResultSchema = z.object({ restored: z.array(z.string()).nullable() })
export type UndoResult = z.infer<typeof UndoResultSchema>

// Stable whatever order the properties arrived in, so a target read back from JSON finds its comments.
export function targetKey(target: DiffTarget): string {
  switch (target.kind) {
    case 'range':
      return `range:${target.mode}:${target.from}:${target.to}${target.path ? `:${target.path}` : ''}`
    case 'commit':
      return `commit:${target.sha}${target.path ? `:${target.path}` : ''}`
    default:
      return target.kind
  }
}

export const CreateReviewSchema = z.object({
  target: DiffTargetSchema,
  path: RepoPathSchema,
  side: z.enum(['additions', 'deletions']),
  line: z.number().int().min(1),
  lineHash: z.string().min(1).max(64),
  body: z.string().trim().min(1).max(20_000),
})
export type CreateReview = z.infer<typeof CreateReviewSchema>

export const UpdateReviewSchema = z.object({ body: CreateReviewSchema.shape.body })
export type UpdateReview = z.infer<typeof UpdateReviewSchema>

export const ReviewCommentSchema = CreateReviewSchema.extend({
  id: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type ReviewComment = z.infer<typeof ReviewCommentSchema>
