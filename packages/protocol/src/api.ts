import { z } from 'zod'
import { type DiffTarget, DiffTargetSchema, FileStatusSchema, RefNameSchema, RepoPathSchema } from './git'

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
  // Single lines of a file, each named by its side and number and checked against its text.
  z.object({
    action: z.enum(['stage-lines', 'unstage-lines', 'discard-lines']),
    file: WriteFileSchema,
    lines: z
      .array(z.object({ side: z.enum(['old', 'new']), line: z.number().int().min(1), text: z.string() }))
      .min(1)
      .max(50_000),
  }),
])
export type WriteRequest = z.infer<typeof WriteRequestSchema>
export type WriteAction = WriteRequest['action']

export const FileContentsSchema = z.object({ text: z.string().nullable(), size: z.number(), binary: z.boolean() })
export type FileContents = z.infer<typeof FileContentsSchema>

export const SyncStatusSchema = z.object({
  branch: z.string().nullable(),
  upstream: z.string().nullable(),
  ahead: z.number().int(),
  behind: z.number().int(),
  staged: z.number().int(),
  operation: z.enum(['merge', 'cherry-pick', 'revert', 'rebase']).nullable(),
})
export type SyncStatus = z.infer<typeof SyncStatusSchema>

export const CommitRequestSchema = z.object({
  message: z.string().trim().min(1).max(100_000),
  amend: z.boolean(),
  signoff: z.boolean().default(false),
})
export type CommitRequest = z.infer<typeof CommitRequestSchema>

export const SwitchRequestSchema = z.object({
  branch: RefNameSchema,
  create: z.boolean(),
  start: RefNameSchema.optional(),
})
export type SwitchRequest = z.infer<typeof SwitchRequestSchema>

export const CheckoutRequestSchema = z.object({ sha: RefNameSchema })

export const RefRequestSchema = z.object({ ref: RefNameSchema })
export const DeleteBranchSchema = z.object({ name: RefNameSchema, force: z.boolean() })

export const StashSaveSchema = z.object({ message: z.string().trim().max(1000), untracked: z.boolean() })
export const StashNameSchema = z.string().regex(/^stash@\{\d+\}$/)
export const StashApplySchema = z.object({ name: StashNameSchema, pop: z.boolean() })
export const StashDropSchema = z.object({ name: StashNameSchema })

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
  // The first line when the comment covers a range ending at line.
  startLine: z.number().int().min(1).optional(),
  // Character columns when the comment is on selected words: from startCol on the first line to endCol on the last.
  startCol: z.number().int().min(0).optional(),
  endCol: z.number().int().min(0).optional(),
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

export const ResolveSchema = z.object({ path: RepoPathSchema, side: z.enum(['ours', 'theirs']) })
// A merged text written over a conflicted file and staged.
export const ResolveTextSchema = z.object({ path: RepoPathSchema, text: z.string().max(20_000_000) })

const ConflictBlockSchema = z.object({
  kind: z.literal('conflict'),
  ours: z.array(z.string()),
  base: z.array(z.string()).nullable(),
  theirs: z.array(z.string()),
  oursLabel: z.string(),
  baseLabel: z.string().nullable(),
  theirsLabel: z.string(),
})
export type ConflictBlock = z.infer<typeof ConflictBlockSchema>
export const ConflictSegmentSchema = z.union([
  z.object({ kind: z.literal('common'), lines: z.array(z.string()) }),
  ConflictBlockSchema,
])
export type ConflictSegment = z.infer<typeof ConflictSegmentSchema>
export const ConflictFileSchema = z.object({
  path: z.string(),
  eol: z.enum(['\n', '\r\n']),
  finalNewline: z.boolean(),
  segments: z.array(ConflictSegmentSchema),
  stages: z.object({ base: z.string().nullable(), ours: z.string().nullable(), theirs: z.string().nullable() }),
})
export type ConflictFile = z.infer<typeof ConflictFileSchema>
export const PathRequestSchema = z.object({ path: RepoPathSchema })
export const ResetSchema = z.object({ sha: RefNameSchema, mode: z.enum(['soft', 'mixed', 'hard']) })
export const RenameBranchSchema = z.object({ from: RefNameSchema, to: RefNameSchema })
export const UpstreamSchema = z.object({ branch: RefNameSchema, upstream: RefNameSchema })
export const RemoteBranchSchema = z.object({ remote: RefNameSchema, branch: RefNameSchema })
export const TagCreateSchema = z.object({ name: RefNameSchema, sha: RefNameSchema, message: z.string().max(10_000) })
export const NameSchema = z.object({ name: RefNameSchema })
export const TagPushSchema = z.object({ remote: RefNameSchema, name: RefNameSchema.nullable() })
// A url that starts with "-" would read as an option to git.
export const RemoteAddSchema = z.object({
  name: RefNameSchema,
  url: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((url) => !url.startsWith('-'), 'invalid url'),
})
export const FetchRemoteSchema = z.object({ remote: RefNameSchema, prune: z.boolean() })
export const RebaseSchema = z.object({ onto: RefNameSchema })
export const MessageSchema = z.object({ message: z.string().trim().max(1000) })

export const RemoteSchema = z.object({ name: z.string(), url: z.string() })
export type Remote = z.infer<typeof RemoteSchema>
export const BlameLineSchema = z.object({ sha: z.string(), author: z.string(), time: z.number(), summary: z.string() })
export type BlameLine = z.infer<typeof BlameLineSchema>

// Where a name is defined, imported and used, from a plain text search like GitHub's code navigation.
export const SymbolHitSchema = z.object({
  path: z.string(),
  line: z.number().int(),
  column: z.number().int(),
  text: z.string(),
  kind: z.enum(['definition', 'import', 'reference']),
})
export type SymbolHit = z.infer<typeof SymbolHitSchema>
export const SymbolResultSchema = z.object({ name: z.string(), hits: z.array(SymbolHitSchema), truncated: z.boolean() })
export type SymbolResult = z.infer<typeof SymbolResultSchema>
export const SymbolQuerySchema = z.object({
  name: z.string().regex(/^[A-Za-z_$][\w$]{0,99}$/),
  ref: RefNameSchema.optional(),
})
export const BlameQuerySchema = z.object({ path: RepoPathSchema, ref: RefNameSchema.optional() })

// Precise navigation from a language server, either Neovim's own clients or one the server starts.
// Lines and columns are 1-based; columns count UTF-16 units, as JavaScript strings do.
export const LspQuerySchema = z.object({
  path: RepoPathSchema,
  line: z.coerce.number().int().min(1),
  column: z.coerce.number().int().min(1),
  ref: RefNameSchema.optional(),
})
export type LspQuery = z.infer<typeof LspQuerySchema>
export const LspSourceSchema = z.enum(['nvim', 'server']).nullable()
export type LspSource = z.infer<typeof LspSourceSchema>
export const LspLocationSchema = z.object({
  path: z.string(),
  line: z.number().int(),
  column: z.number().int(),
  endLine: z.number().int(),
  endColumn: z.number().int(),
  text: z.string(),
})
export type LspLocation = z.infer<typeof LspLocationSchema>
export const LspLocationsSchema = z.object({
  source: LspSourceSchema,
  server: z.string().nullable(),
  locations: z.array(LspLocationSchema),
})
export type LspLocations = z.infer<typeof LspLocationsSchema>
export const LspHoverSchema = z.object({
  source: LspSourceSchema,
  server: z.string().nullable(),
  contents: z.string().nullable(),
})
export type LspHover = z.infer<typeof LspHoverSchema>

// Rewriting history: an interactive rebase plan, fixups, picking several commits, and bisect.
export const PlanCommitSchema = z.object({ sha: z.string(), subject: z.string(), author: z.string(), time: z.number() })
export type PlanCommit = z.infer<typeof PlanCommitSchema>
export const RebaseActionSchema = z.enum(['pick', 'reword', 'edit', 'squash', 'fixup', 'drop'])
export type RebaseAction = z.infer<typeof RebaseActionSchema>
export const InteractiveRebaseSchema = z.object({
  base: RefNameSchema,
  steps: z
    .array(z.object({ sha: RefNameSchema, action: RebaseActionSchema, message: z.string().max(100_000).optional() }))
    .min(1)
    .max(2000),
})
export type InteractiveRebase = z.infer<typeof InteractiveRebaseSchema>
export const ShaListSchema = z.object({ shas: z.array(RefNameSchema).min(1).max(1000) })
export const BisectMarkSchema = z.object({ kind: z.enum(['good', 'bad', 'skip']), sha: RefNameSchema.optional() })
export const BisectRunSchema = z.object({ command: z.string().trim().min(1).max(2000) })
export const BisectStateSchema = z.object({
  active: z.boolean(),
  bad: z.boolean(),
  good: z.number().int(),
  remaining: z.number().nullable(),
  culprit: z.object({ sha: z.string(), subject: z.string() }).nullable(),
  log: z.string(),
})
export type BisectState = z.infer<typeof BisectStateSchema>

// Worktrees and submodules.
export const WorktreeSchema = z.object({
  path: z.string(),
  head: z.string().nullable(),
  branch: z.string().nullable(),
  main: z.boolean(),
  current: z.boolean(),
  locked: z.boolean(),
  prunable: z.boolean(),
})
export type Worktree = z.infer<typeof WorktreeSchema>
const AbsolutePathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => path.startsWith('/') && !path.includes('\0'), 'an absolute path')
export const WorktreeAddSchema = z.object({
  path: AbsolutePathSchema,
  branch: RefNameSchema,
  create: z.boolean(),
  start: RefNameSchema.optional(),
})
export const WorktreeRemoveSchema = z.object({ path: AbsolutePathSchema, force: z.boolean() })
export const OpenRepoSchema = z.object({ path: AbsolutePathSchema })
export const SubmoduleSchema = z.object({
  path: z.string(),
  recorded: z.string(),
  current: z.string().nullable(),
  initialized: z.boolean(),
  url: z.string().nullable(),
})
export type Submodule = z.infer<typeof SubmoduleSchema>
export const SubmoduleUpdateSchema = z.object({ path: RepoPathSchema.optional(), init: z.boolean() })
export const SubmoduleLogQuerySchema = z.object({
  path: RepoPathSchema,
  from: RefNameSchema.optional(),
  to: RefNameSchema,
})
export const SubmoduleCommitSchema = PlanCommitSchema
export type SubmoduleCommit = PlanCommit
