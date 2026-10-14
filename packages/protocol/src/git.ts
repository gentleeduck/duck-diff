import { z } from 'zod'

// Refs come from the page, so anything that git could read as an option is refused.
const RefName = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !value.startsWith('-') && !/[\s\0]/.test(value), 'invalid ref')

export const DiffTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unstaged') }),
  z.object({ kind: z.literal('staged') }),
  z.object({ kind: z.literal('local') }),
  z.object({ kind: z.literal('range'), from: RefName, to: RefName, mode: z.enum(['two-dot', 'merge-base']) }),
  z.object({ kind: z.literal('commit'), sha: RefName }),
])
export type DiffTarget = z.infer<typeof DiffTargetSchema>

export const FileStatusSchema = z.enum([
  'added',
  'modified',
  'deleted',
  'renamed',
  'copied',
  'type-changed',
  'untracked',
])
export type FileStatus = z.infer<typeof FileStatusSchema>

export const ChangedFileSchema = z.object({
  path: z.string(),
  oldPath: z.string().nullable(),
  status: FileStatusSchema,
  additions: z.number().int().nullable(),
  deletions: z.number().int().nullable(),
  binary: z.boolean(),
  oldSha: z.string().nullable(),
  newSha: z.string().nullable(),
})
export type ChangedFile = z.infer<typeof ChangedFileSchema>

export const CommitSchema = z.object({
  sha: z.string(),
  parents: z.array(z.string()),
  authorName: z.string(),
  authorEmail: z.string(),
  authoredAt: z.number(),
  subject: z.string(),
})
export type Commit = z.infer<typeof CommitSchema>

export const RefKindSchema = z.enum(['branch', 'remote', 'tag'])
export type RefKind = z.infer<typeof RefKindSchema>

export const RefSchema = z.object({
  name: z.string(),
  kind: RefKindSchema,
  sha: z.string(),
  committedAt: z.number(),
  current: z.boolean(),
})
export type Ref = z.infer<typeof RefSchema>
