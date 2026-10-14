import { z } from 'zod'

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

export const PullDetailsSchema = PullSummarySchema.extend({
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
  body: z.string(),
  conversation: z.array(ConversationCommentSchema),
})
export type IssueDetails = z.infer<typeof IssueDetailsSchema>

export const ReviewEventSchema = z.enum(['COMMENT', 'APPROVE', 'REQUEST_CHANGES'])

export const PostCommentSchema = z.object({ body: z.string().trim().min(1).max(65_000) })
export const PostReviewCommentSchema = PostCommentSchema.extend({
  path: z.string().min(1),
  line: z.number().int().min(1),
  side: z.enum(['LEFT', 'RIGHT']),
})
export const SubmitReviewSchema = z.object({ event: ReviewEventSchema, body: z.string().max(65_000) })
export const MergePullSchema = z.object({ method: z.enum(['merge', 'squash', 'rebase']) })
export const CreateIssueSchema = z.object({ title: z.string().trim().min(1).max(256), body: z.string().max(65_000) })
export const SetTokenSchema = z.object({ token: z.string().trim().min(10).max(500) })
export const PullRefsSchema = z.object({ base: z.string(), head: z.string() })
export type PullRefs = z.infer<typeof PullRefsSchema>
