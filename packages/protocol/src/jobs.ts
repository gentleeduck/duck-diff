import { z } from 'zod'

// One user action as the page shows it: what ran, how it ended, and (separately) everything it printed.
export const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  // The main git command as it would be typed, for the list.
  command: z.string(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  status: z.enum(['running', 'ok', 'failed']),
  error: z.string().nullable(),
  // The git action it runs (push, commit), so every page shows it busy, a reloaded one too.
  action: z.string().optional(),
})
export type Job = z.infer<typeof JobSchema>
