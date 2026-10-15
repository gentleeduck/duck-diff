import { z } from 'zod'
import { RefNameSchema } from './git'

export const GitHubUserSchema = z.object({ login: z.string(), avatarUrl: z.string() })
export type GitHubUser = z.infer<typeof GitHubUserSchema>

export const GitHubLabelSchema = z.object({ name: z.string(), color: z.string() })

export const GitHubStatusSchema = z.object({
  // owner/name of the repo's GitHub remote, or null when it has none.
  repo: z.string().nullable(),
  user: GitHubUserSchema.nullable(),
  source: z.enum(['env', 'gh', 'token']).nullable(),
})
export type GitHubStatus = z.infer<typeof GitHubStatusSchema>

export const PullSummarySchema = z.object({
  number: z.number().int(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  merged: z.boolean(),
  draft: z.boolean(),
  author: GitHubUserSchema,
  headRef: z.string(),
  baseRef: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  labels: z.array(GitHubLabelSchema),
  url: z.string(),
})
export type PullSummary = z.infer<typeof PullSummarySchema>

export const ConversationCommentSchema = z.object({
  id: z.number().int(),
  author: GitHubUserSchema,
  body: z.string(),
  createdAt: z.string(),
})
export type ConversationComment = z.infer<typeof ConversationCommentSchema>

export const GitHubReviewCommentSchema = ConversationCommentSchema.extend({
  path: z.string(),
  line: z.number().int().nullable(),
  side: z.enum(['LEFT', 'RIGHT']),
  inReplyTo: z.number().int().nullable(),
})
export type GitHubReviewComment = z.infer<typeof GitHubReviewCommentSchema>

export const ReviewerSchema = GitHubUserSchema.extend({
  // The latest review they left, or null while their review is only requested.
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING']).nullable(),
})
export type Reviewer = z.infer<typeof ReviewerSchema>

export const PullDetailsSchema = PullSummarySchema.extend({
  commits: z.number().int(),
  assignees: z.array(GitHubUserSchema),
  milestone: z.string().nullable(),
  reviewers: z.array(ReviewerSchema),
  mergeableState: z.string(),
  nodeId: z.string(),
  locked: z.boolean(),
  autoMerge: z.boolean(),
  // The head branch lives in this repo (not a fork), so it can be deleted or restored here.
  sameRepo: z.boolean(),
  headExists: z.boolean(),
  body: z.string(),
  headSha: z.string(),
  baseSha: z.string(),
  mergeable: z.boolean().nullable(),
  additions: z.number().int(),
  deletions: z.number().int(),
  changedFiles: z.number().int(),
  comments: z.array(ConversationCommentSchema),
  reviewComments: z.array(GitHubReviewCommentSchema),
})
export type PullDetails = z.infer<typeof PullDetailsSchema>

export const IssueSummarySchema = z.object({
  number: z.number().int(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  author: GitHubUserSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  labels: z.array(GitHubLabelSchema),
  comments: z.number().int(),
  url: z.string(),
})
export type IssueSummary = z.infer<typeof IssueSummarySchema>

export const IssueDetailsSchema = IssueSummarySchema.extend({
  locked: z.boolean(),
  assignees: z.array(GitHubUserSchema),
  milestone: z.string().nullable(),
  body: z.string(),
  conversation: z.array(ConversationCommentSchema),
})
export type IssueDetails = z.infer<typeof IssueDetailsSchema>

export const CheckRunSchema = z.object({
  name: z.string(),
  // queued and in_progress have no conclusion yet.
  status: z.enum(['queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending']),
  conclusion: z
    .enum(['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale'])
    .nullable(),
  url: z.string(),
  // GitHub Actions ids, when the run came from a workflow, for its log and re-run.
  runId: z.number().int().nullable(),
  jobId: z.number().int().nullable(),
})
export type CheckRun = z.infer<typeof CheckRunSchema>

export const ReviewEventSchema = z.enum(['COMMENT', 'APPROVE', 'REQUEST_CHANGES'])

export const PostCommentSchema = z.object({ body: z.string().trim().min(1).max(65_000) })
export const PostReviewCommentSchema = PostCommentSchema.extend({
  path: z.string().min(1),
  line: z.number().int().min(1),
  side: z.enum(['LEFT', 'RIGHT']),
})
export const ReplySchema = PostCommentSchema.extend({ inReplyTo: z.number().int() })
export const PendingCommentSchema = z.object({
  path: z.string().min(1),
  line: z.number().int().min(1),
  side: z.enum(['LEFT', 'RIGHT']),
  body: z.string().trim().min(1).max(65_000),
})
export type PendingComment = z.infer<typeof PendingCommentSchema>
// A review carries the line comments gathered before it, as GitHub's "Start a review" does.
export const SubmitReviewSchema = z.object({
  event: ReviewEventSchema,
  body: z.string().max(65_000),
  comments: z.array(PendingCommentSchema).max(200).default([]),
})
export const ReviewStateSchema = z.object({
  threads: z.array(z.object({ id: z.string(), resolved: z.boolean(), outdated: z.boolean(), root: z.number().int() })),
  // Files the signed-in user marked viewed on GitHub.
  viewed: z.array(z.string()),
})
export type ReviewState = z.infer<typeof ReviewStateSchema>
export const ResolveThreadSchema = z.object({ thread: z.string().min(1), resolved: z.boolean() })
export const ViewedSchema = z.object({ path: z.string().min(1), viewed: z.boolean() })
export const MergePullSchema = z.object({ method: z.enum(['merge', 'squash', 'rebase']) })
export const CreatePullSchema = z.object({
  title: z.string().trim().min(1).max(256),
  body: z.string().max(65_000),
  head: RefNameSchema,
  base: RefNameSchema,
  draft: z.boolean(),
  reviewers: z.array(z.string().min(1).max(100)).max(15).default([]),
  labels: z.array(z.string().min(1).max(100)).max(100).default([]),
  assignees: z.array(z.string().min(1).max(100)).max(10).default([]),
})
export type CreatePull = z.infer<typeof CreatePullSchema>
export const CreateIssueSchema = z.object({
  title: z.string().trim().min(1).max(256),
  body: z.string().max(65_000),
  labels: z.array(z.string().min(1).max(100)).max(100).default([]),
  assignees: z.array(z.string().min(1).max(100)).max(10).default([]),
})
export const SetTokenSchema = z.object({ token: z.string().trim().min(10).max(500) })
export const PullRefsSchema = z.object({ base: z.string(), head: z.string() })
export type PullRefs = z.infer<typeof PullRefsSchema>

export const ListFilterSchema = z.enum(['all', 'mine', 'review-requested', 'assigned', 'mentioned'])
export const ListSortSchema = z.enum(['updated', 'created', 'comments'])
export const ListQuerySchema = z.object({
  kind: z.enum(['pr', 'issue']),
  state: z.enum(['open', 'closed']).default('open'),
  filter: ListFilterSchema.default('all'),
  sort: ListSortSchema.default('updated'),
  // Free text in GitHub's own search syntax, added to the filters above.
  query: z.string().max(256).default(''),
  after: z.string().max(200).optional(),
})
export type ListQuery = z.infer<typeof ListQuerySchema>

export const ListItemSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  merged: z.boolean(),
  draft: z.boolean(),
  author: GitHubUserSchema,
  labels: z.array(GitHubLabelSchema),
  comments: z.number().int(),
  assignees: z.array(GitHubUserSchema),
  milestone: z.string().nullable(),
  updatedAt: z.string(),
  url: z.string(),
  // Pull requests only.
  review: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED']).nullable(),
  checks: z.enum(['SUCCESS', 'FAILURE', 'ERROR', 'PENDING', 'EXPECTED']).nullable(),
})
export type ListItem = z.infer<typeof ListItemSchema>

export const ListPageSchema = z.object({
  items: z.array(ListItemSchema),
  total: z.number().int(),
  cursor: z.string().nullable(),
})
export type ListPage = z.infer<typeof ListPageSchema>

export const REACTIONS = ['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes'] as const
export const ReactionSchema = z.enum(REACTIONS)
export type Reaction = z.infer<typeof ReactionSchema>
export const ReactionCountsSchema = z.partialRecord(ReactionSchema, z.number().int())

export const TimelineEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('comment'),
    id: z.number().int(),
    author: GitHubUserSchema,
    body: z.string(),
    // GitHub's own rendering of the body, when it sent one.
    html: z.string().nullable(),
    createdAt: z.string(),
    edited: z.boolean(),
    reactions: ReactionCountsSchema,
    url: z.string(),
  }),
  z.object({
    kind: z.literal('review'),
    id: z.number().int(),
    author: GitHubUserSchema,
    state: z.string(),
    body: z.string(),
    html: z.string().nullable(),
    createdAt: z.string(),
  }),
  z.object({
    kind: z.literal('commit'),
    sha: z.string(),
    message: z.string(),
    author: z.string(),
    createdAt: z.string(),
  }),
  z.object({
    kind: z.literal('event'),
    id: z.string(),
    // What happened, for the icon: labeled, closed, merged, renamed, referenced...
    event: z.string(),
    actor: GitHubUserSchema,
    text: z.string(),
    createdAt: z.string(),
  }),
])
export type TimelineEvent = z.infer<typeof TimelineEventSchema>

export const ThreadSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  body: z.string(),
  html: z.string().nullable(),
  author: GitHubUserSchema,
  createdAt: z.string(),
  edited: z.boolean(),
  reactions: ReactionCountsSchema,
  timeline: z.array(TimelineEventSchema),
  // What the signed-in user may change, so the page only offers what GitHub will accept.
  viewer: z.object({ login: z.string(), canEdit: z.boolean() }),
})
export type Thread = z.infer<typeof ThreadSchema>

export const EditIssueSchema = z.object({
  title: z.string().trim().min(1).max(256).optional(),
  body: z.string().max(65_000).optional(),
  assignees: z.array(z.string().min(1).max(100)).max(10).optional(),
  labels: z.array(z.string().min(1).max(100)).max(100).optional(),
  // The milestone's number, or null to clear it.
  milestone: z.number().int().nullable().optional(),
})
export const ReviewersSchema = z.object({
  add: z.array(z.string().min(1).max(100)).max(15),
  remove: z.array(z.string().min(1).max(100)).max(15),
})
export const DraftSchema = z.object({ draft: z.boolean() })
export const LockSchema = z.object({ locked: z.boolean() })
export const OptionsSchema = z.object({
  labels: z.array(z.object({ name: z.string(), color: z.string(), description: z.string() })),
  milestones: z.array(z.object({ number: z.number().int(), title: z.string() })),
  people: z.array(GitHubUserSchema),
})
export type Options = z.infer<typeof OptionsSchema>
export const ReactSchema = z.object({
  target: z.union([z.object({ issue: z.number().int() }), z.object({ comment: z.number().int() })]),
  content: ReactionSchema,
})
export const MentionSchema = z.object({ login: z.string(), avatarUrl: z.string() })
export const ReferenceSchema = z.object({ number: z.number().int(), title: z.string(), pull: z.boolean() })

export const PullCommitSchema = z.object({
  sha: z.string(),
  message: z.string(),
  author: GitHubUserSchema,
  authorName: z.string(),
  date: z.string(),
})
export type PullCommit = z.infer<typeof PullCommitSchema>

export const AutoMergeSchema = z.object({ enabled: z.boolean(), method: z.enum(['merge', 'squash', 'rebase']) })
export const BaseSchema = z.object({ base: z.string().min(1).max(256) })
export const RerunSchema = z.object({ runId: z.number().int() })

export const FormFieldSchema = z.object({
  type: z.enum(['markdown', 'input', 'textarea', 'dropdown', 'checkboxes']),
  id: z.string(),
  label: z.string(),
  description: z.string(),
  placeholder: z.string(),
  value: z.string(),
  options: z.array(z.string()),
  required: z.boolean(),
})
export type FormField = z.infer<typeof FormFieldSchema>

export const IssueTemplateSchema = z.object({
  file: z.string(),
  name: z.string(),
  about: z.string(),
  title: z.string(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  // A Markdown template's body, or null for an issue form, whose fields are in `form`.
  body: z.string().nullable(),
  form: z.array(FormFieldSchema),
})
export type IssueTemplate = z.infer<typeof IssueTemplateSchema>

export const TemplatesSchema = z.object({ issue: z.array(IssueTemplateSchema), pull: z.string().nullable() })
export type Templates = z.infer<typeof TemplatesSchema>
