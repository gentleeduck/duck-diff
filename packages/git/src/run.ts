import { AsyncLocalStorage } from 'node:async_hooks'
import { spawn } from 'node:child_process'
import { classify, GitError } from './errors'

export interface RunOptions {
  cwd: string
  okExitCodes?: number[]
  timeoutMs?: number
  // Keeps stdin open instead of closing it at once; only the timeout test needs this.
  holdStdin?: boolean
  // Written to stdin, for commands such as `git apply -` that read a patch.
  input?: string
  // Extra environment, on top of the fixed one below.
  env?: Record<string, string>
}

const DEFAULT_TIMEOUT_MS = 30_000

// GIT_OPTIONAL_LOCKS=0 keeps reads from rewriting .git/index (the repo may be a receive-only sync copy).
const ENV = { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' }

// Where a user action's commands and output go, so the page can show what ran instead of working headless.
export interface OutputSink {
  // plumbing marks internal reads, shown dimmer than the commands the action is about.
  command(args: string[], plumbing: boolean): void
  output(chunk: string, stream: 'stdout' | 'stderr'): void
}

const sinks = new AsyncLocalStorage<OutputSink>()

// Every git command started inside task, however deep, reports to sink.
export function withOutput<T>(sink: OutputSink, task: () => Promise<T>): Promise<T> {
  return sinks.run(sink, task)
}

// Reads whose stdout only the code parses; their errors still show.
const PLUMBING = new Set([
  'cat-file',
  'diff',
  'for-each-ref',
  'log',
  'ls-files',
  'merge-base',
  'remote',
  'rev-list',
  'rev-parse',
  'show',
  'status',
  'symbolic-ref',
])

const subcommand = (args: string[]) => args.find((arg, at) => !arg.startsWith('-') && args[at - 1] !== '-c')

// Options that make git run another program. No caller builds them, so one here came from input.
const RUNS_PROGRAM = /^--(upload-pack|receive-pack|exec)(=|$)/

// A remote, branch or tag name from the page must not reach git as an option.
export function notOption(value: string, what: string): string {
  if (value.startsWith('-')) throw new GitError('failed', null, '', `refused ${what} "${value}": it reads as an option`)
  return value
}

function spawnGit(args: string[], options: RunOptions) {
  const option = args.find((arg) => RUNS_PROGRAM.test(arg))
  if (option) throw new GitError('failed', null, '', `refused git option ${option.split('=')[0]}`)
  const sink = sinks.getStore()
  // Hooks run under git with pipes, not a terminal; most tools still print color when asked.
  const env = sink ? { ...ENV, ...options.env, FORCE_COLOR: '1' } : options.env ? { ...ENV, ...options.env } : ENV
  const plumbing = PLUMBING.has(subcommand(args) ?? '')
  sink?.command(args, plumbing)
  const child = spawn('git', args, { cwd: options.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  if (options.input !== undefined) child.stdin.end(options.input)
  else if (!options.holdStdin) child.stdin.end()
  let stderr = ''
  let timedOut = false
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk
    sink?.output(chunk, 'stderr')
  })
  if (sink && !plumbing) {
    child.stdout.on('data', (chunk: Buffer | string) => sink.output(String(chunk), 'stdout'))
  }
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  const done = new Promise<void>((resolve, reject) => {
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new GitError('failed', null, String(error), `git ${args[0]} failed to start`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return reject(new GitError('timeout', null, stderr, `git ${args[0]} timed out`))
      const ok = [0, ...(options.okExitCodes ?? [])]
      if (code !== null && ok.includes(code)) return resolve()
      reject(new GitError(classify(stderr), code, stderr, `git ${args[0]} exited ${code}: ${stderr.trim()}`))
    })
  })
  return { child, done }
}

export async function runGit(args: string[], options: RunOptions): Promise<string> {
  const { child, done } = spawnGit(args, options)
  let stdout = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk
  })
  await done
  return stdout
}

export async function runGitBytes(args: string[], options: RunOptions): Promise<Buffer> {
  const { child, done } = spawnGit(args, options)
  const chunks: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
  await done
  return Buffer.concat(chunks)
}

export async function* streamGit(args: string[], options: RunOptions): AsyncIterable<string> {
  const { child, done } = spawnGit(args, options)
  child.stdout.setEncoding('utf8')
  let finished = false
  try {
    for await (const chunk of child.stdout) yield chunk as string
    finished = true
    await done
  } finally {
    // The reader left early (a closed page): stop git and drop its exit, which nobody is waiting for.
    if (!finished) {
      done.catch(() => {})
      child.kill('SIGKILL')
    }
  }
}
