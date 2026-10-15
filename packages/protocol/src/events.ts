import { z } from 'zod'
import { RepoInfoSchema } from './api'
import { DiffTargetSchema } from './git'

export const ServerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), repo: RepoInfoSchema }),
  z.object({ type: z.literal('changed'), reason: z.enum(['worktree', 'index', 'refs', 'saved', 'reviews']) }),
  // Neovim asked for another comparison while a page is already open.
  z.object({ type: z.literal('navigate'), target: DiffTargetSchema }),
])
export type ServerEvent = z.infer<typeof ServerEventSchema>
export type ChangeReason = Extract<ServerEvent, { type: 'changed' }>['reason']
