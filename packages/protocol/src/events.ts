import { z } from 'zod'
import { RepoInfoSchema } from './api'
import { DiffTargetSchema } from './git'
import { JobSchema } from './jobs'

export const ServerEventSchema = z.discriminatedUnion('type', [
  // build changes when a new server binary has taken over, which tells an open page to reload.
  z.object({ type: z.literal('hello'), repo: RepoInfoSchema, build: z.string().optional() }),
  z.object({ type: z.literal('changed'), reason: z.enum(['worktree', 'index', 'refs', 'saved', 'reviews']) }),
  // Neovim asked for another comparison while a page is already open.
  z.object({ type: z.literal('navigate'), target: DiffTargetSchema }),
  // Something a page watches on GitHub changed; the page reads it again.
  z.object({ type: z.literal('github'), topic: z.string() }),
  // A user action started or ended; its output follows in job-output events, in order.
  z.object({ type: z.literal('job'), job: JobSchema }),
  z.object({ type: z.literal('job-output'), id: z.string(), data: z.string() }),
  // What pages save (settings, keys, tabs) changed, here or through another repo's server; a page that just
  // connected gets every value, so a save that landed after the page was served still reaches it.
  z.object({ type: z.literal('state'), changes: z.record(z.string(), z.string().nullable()) }),
])
export type ServerEvent = z.infer<typeof ServerEventSchema>
export type ChangeReason = Extract<ServerEvent, { type: 'changed' }>['reason']

// What a page tells the server: the GitHub things it shows, so one poller can watch them for every page.
export const GitHubTopicSchema = z.string().regex(/^(notifications|pulls|issues|runs|item:\d{1,9})$/)
export const ClientMessageSchema = z.object({ type: z.literal('watch'), topics: z.array(GitHubTopicSchema).max(50) })
export type ClientMessage = z.infer<typeof ClientMessageSchema>
