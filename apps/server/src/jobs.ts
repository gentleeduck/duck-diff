import { withOutput } from '@duck-diff/git'
import type { Job, ServerEvent } from '@duck-diff/protocol'
import type { DiskCache } from './disk-cache'

export interface Jobs {
  // Settles once jobs saved by an earlier run are back.
  ready: Promise<void>
  // Runs a user action, recording every git command it starts and everything they print.
  run<T>(title: string, task: () => Promise<T>): Promise<T>
  // Newest first.
  list(): Job[]
  output(id: string): string | null
  // Forgets the finished jobs; one still running stays, it has more to print.
  clear(): void
}

interface Entry {
  job: Job
  output: string
  pending: string
  timer: ReturnType<typeof setTimeout> | null
}

const SAFE = /^[\w@%+=:,./-]+$/
const quote = (arg: string) => (SAFE.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`)
export const commandLine = (args: string[]) => ['git', ...args].map(quote).join(' ')

// stage-hunk reads as Stage hunk.
export const jobTitle = (action: string) => {
  const words = action.replaceAll('-', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
const PROMPT = '\x1b[1;34m$\x1b[0m '
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

export function createJobs(
  publish: (event: ServerEvent) => void,
  {
    keep = 50,
    maxOutput = 1_000_000,
    flushMs = 16,
    cache,
    keepOutput = 64 * 1024,
  }: { keep?: number; maxOutput?: number; flushMs?: number; cache?: DiskCache; keepOutput?: number } = {},
): Jobs {
  const entries: Entry[] = []
  let counter = 0
  // The finished jobs and the tail of what they printed outlive a restart or a new build taking over.
  const save = () =>
    cache?.set(
      'jobs',
      'list',
      entries
        .filter((entry) => entry.job.status !== 'running')
        .map((entry) => ({ job: entry.job, output: entry.output.slice(-keepOutput) })),
    )
  const ready = (async () => {
    const saved = (await cache?.get<{ job: Job; output: string }[]>('jobs', 'list').catch(() => null)) ?? []
    for (const { job, output } of saved) {
      if (entries.length < keep) entries.push({ job, output, pending: '', timer: null })
    }
  })()

  // Output is batched per frame so a chatty hook sends a few messages, not thousands.
  const flush = (entry: Entry) => {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = null
    if (!entry.pending) return
    publish({ type: 'job-output', id: entry.job.id, data: entry.pending })
    entry.pending = ''
  }
  const write = (entry: Entry, text: string) => {
    entry.output += text
    if (entry.output.length > maxOutput) entry.output = entry.output.slice(-maxOutput)
    entry.pending += text
    entry.timer ??= setTimeout(() => flush(entry), flushMs)
  }

  return {
    ready,
    async run(title, task) {
      const job: Job = {
        id: `job-${Date.now().toString(36)}-${(counter++).toString(36)}`,
        title,
        command: '',
        startedAt: Date.now(),
        endedAt: null,
        status: 'running',
        error: null,
      }
      const entry: Entry = { job, output: '', pending: '', timer: null }
      entries.unshift(entry)
      entries.splice(keep)
      publish({ type: 'job', job: { ...job } })
      const sink = {
        command(args: string[], plumbing: boolean) {
          const line = commandLine(args)
          if (!plumbing && !job.command) job.command = line
          write(entry, plumbing ? `${DIM}$ ${line}${RESET}\n` : `${PROMPT}${line}\n`)
        },
        output: (chunk: string) => write(entry, chunk),
      }
      const end = (status: Job['status'], error: string | null) => {
        job.status = status
        job.error = error
        job.endedAt = Date.now()
        job.command ||= title
        const took = `${((job.endedAt - job.startedAt) / 1000).toFixed(1)}s`
        write(
          entry,
          status === 'ok' ? `\x1b[32mdone in ${took}${RESET}\n` : `\x1b[31mfailed after ${took}: ${error}${RESET}\n`,
        )
        flush(entry)
        publish({ type: 'job', job: { ...job } })
        save()
      }
      try {
        const result = await withOutput(sink, task)
        end('ok', null)
        return result
      } catch (error) {
        end('failed', (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? 'failed')
        throw error
      }
    },
    list: () => entries.map((entry) => ({ ...entry.job })),
    clear() {
      const running = entries.filter((entry) => entry.job.status === 'running')
      entries.splice(0, entries.length, ...running)
      save()
    },
    output: (id) => entries.find((entry) => entry.job.id === id)?.output ?? null,
  }
}
