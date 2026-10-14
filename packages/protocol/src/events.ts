import { z } from 'zod'
import { RepoInfoSchema } from './api'

export const ServerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), repo: RepoInfoSchema }),
  z.object({ type: z.literal('changed'), reason: z.enum(['worktree', 'index', 'refs', 'saved']) }),
])
export type ServerEvent = z.infer<typeof ServerEventSchema>
export type ChangeReason = Extract<ServerEvent, { type: 'changed' }>['reason']
