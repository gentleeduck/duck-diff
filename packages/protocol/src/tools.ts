import { z } from 'zod'
import { PlanCommitSchema, RebaseActionSchema } from './api'
import { DiffTargetSchema, RefNameSchema } from './git'

// What git hands duck-diff when it runs as git's merge tool, diff tool or rebase todo editor (duck-diff
// git-setup), as a page shows it.
export const ToolSpecSchema = z.discriminatedUnion('kind', [
  // One conflicted file git is waiting on; the page shows every conflict.
  z.object({ id: z.string(), kind: z.literal('merge'), path: z.string() }),
  // One file of a git difftool run, its two sides kept as two commits of their own.
  z.object({ id: z.string(), kind: z.literal('diff'), path: z.string(), target: DiffTargetSchema }),
  // The commits of a git rebase -i, in the todo's order with the action each starts with.
  z.object({
    id: z.string(),
    kind: z.literal('rebase'),
    steps: z.array(z.object({ commit: PlanCommitSchema, action: RebaseActionSchema })),
  }),
])
export type ToolSpec = z.infer<typeof ToolSpecSchema>

export const ToolStateSchema = z.object({ done: z.boolean(), ok: z.boolean(), pages: z.number().int() })
export type ToolState = z.infer<typeof ToolStateSchema>

// A page finishing a tool: ok false gives up (git aborts the rebase, or keeps the file conflicted). A rebase
// sends the todo it ends with.
export const ToolFinishSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  steps: z
    .array(z.object({ sha: RefNameSchema, action: RebaseActionSchema, message: z.string().max(100_000).optional() }))
    .max(2000)
    .optional(),
})
export type ToolFinish = z.infer<typeof ToolFinishSchema>
