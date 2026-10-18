import { AsyncLocalStorage } from 'node:async_hooks'
import { spawn } from 'node:child_process'
import { classify, GitError } from './errors'

export interface RunOptions {
  cwd: string
  okExitCodes?: number[]
  // How long git may print nothing before it is stopped; output of any kind starts the wait over. A user action's
  // commands (run inside withOutput) have no limit: a push of a big repo or a long hook takes what it takes.
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

interface GitProcess {
  stdout: AsyncIterable<Uint8Array>
  stderr: AsyncIterable<Uint8Array>
  // The exit code, or null when a signal ended it.
  exited: Promise<number | null>
  kill(): void
}

// The slice of Bun.spawn used here; this package also runs under Node, without Bun's types.
interface BunRuntime {
  spawn(
    command: string[],
    options: {
      cwd: string
      env: Record<string, string | undefined>
      stdin: 'pipe' | 'ignore' | Blob
      stdout: 'pipe'
      stderr: 'pipe'
      detached: boolean
    },
  ): {
    pid: number
    stdout: AsyncIterable<Uint8Array>
    stderr: AsyncIterable<Uint8Array>
    exited: Promise<number>
    exitCode: number | null
    kill(signal: string): void
  }
}
const bun = (globalThis as { Bun?: BunRuntime }).Bun

// Under Bun (the server and the binary) git starts through Bun.spawn: Bun's node:child_process can report a
// quick child's exit inside spawn() and drop its output on a loaded macOS machine (oven-sh/bun#45483).
// Under Node, where the package's own tests run, it is node:child_process.
// git leads its own process group, so stopping it stops the hooks and whatever they started too.
const killGroup = (pid: number | undefined, fallback: () => void) => {
  try {
    if (pid) process.kill(-pid, 'SIGKILL')
    else fallback()
  } catch {
    fallback()
  }
}

function startGit(args: string[], env: Record<string, string | undefined>, options: RunOptions): GitProcess {
  if (bun) {
    const stdin = options.input !== undefined ? new Blob([options.input]) : options.holdStdin ? 'pipe' : 'ignore'
    const proc = bun.spawn(['git', ...args], {
      cwd: options.cwd,
      env,
      stdin,
      stdout: 'pipe',
      stderr: 'pipe',
      detached: true,
    })
    return {
      stdout: proc.stdout,
      stderr: proc.stderr,
      exited: proc.exited.then(() => proc.exitCode),
      kill: () => killGroup(proc.pid, () => proc.kill('SIGKILL')),
    }
  }
  const child = spawn('git', args, { cwd: options.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true })
  if (options.input !== undefined) child.stdin.end(options.input)
  else if (!options.holdStdin) child.stdin.end()
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolve(code))
  })
  return {
    stdout: child.stdout,
    stderr: child.stderr,
    exited,
    kill: () => killGroup(child.pid, () => child.kill('SIGKILL')),
  }
}

const quiet = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} minutes` : `${Math.round(ms / 1000)} seconds`)

// Decoded text from a stream of bytes, keeping a character split across two chunks whole.
async function* text(chunks: AsyncIterable<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder()
  for await (const chunk of chunks) {
    const piece = decoder.decode(chunk, { stream: true })
    if (piece) yield piece
  }
  const rest = decoder.decode()
  if (rest) yield rest
}

function spawnGit(args: string[], options: RunOptions) {
  const option = args.find((arg) => RUNS_PROGRAM.test(arg))
  if (option) throw new GitError('failed', null, '', `refused git option ${option.split('=')[0]}`)
  const sink = sinks.getStore()
  // Hooks run under git with pipes, not a terminal; most tools still print color when asked.
  const env = sink ? { ...ENV, ...options.env, FORCE_COLOR: '1' } : options.env ? { ...ENV, ...options.env } : ENV
  const plumbing = PLUMBING.has(subcommand(args) ?? '')
  sink?.command(args, plumbing)
  let git: GitProcess
  try {
    git = startGit(args, env, options)
  } catch (error) {
    throw new GitError('failed', null, String(error), `git ${args[0]} failed to start`)
  }
  // A limit on silence, not on the whole run, and none at all for what a user action runs.
  const limit = sink ? null : (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const wait = () => {
    if (limit === null) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      timedOut = true
      git.kill()
    }, limit)
  }
  wait()

  let stderr = ''
  const readStderr = (async () => {
    for await (const chunk of text(git.stderr)) {
      wait()
      stderr += chunk
      sink?.output(chunk, 'stderr')
    }
  })()
  const shown = sink && !plumbing ? sink : null
  const stdoutBytes = (async function* () {
    const decoder = new TextDecoder()
    for await (const chunk of git.stdout) {
      wait()
      shown?.output(decoder.decode(chunk, { stream: true }), 'stdout')
      yield chunk
    }
  })()

  const done = (async () => {
    let code: number | null
    try {
      ;[code] = await Promise.all([git.exited, readStderr])
    } catch (error) {
      throw new GitError('failed', null, String(error), `git ${args[0]} failed to start`)
    } finally {
      clearTimeout(timer)
    }
    if (timedOut)
      throw new GitError(
        'timeout',
        null,
        stderr,
        `git ${subcommand(args) ?? args[0]} printed nothing for ${quiet(limit ?? 0)} and was stopped`,
      )
    const ok = [0, ...(options.okExitCodes ?? [])]
    if (code !== null && ok.includes(code)) return
    throw new GitError(classify(stderr), code, stderr, `git ${args[0]} exited ${code}: ${stderr.trim()}`)
  })()
  // A caller that stops reading early (streamGit) handles done itself; this keeps it from going unhandled meanwhile.
  done.catch(() => {})
  return { stdout: stdoutBytes, kill: () => git.kill(), done }
}

// Reads all of stdout, then the exit. When the read itself fails (git never started), the exit says why.
async function readAll<T>(read: Promise<T>, done: Promise<void>): Promise<T> {
  let result: T
  try {
    result = await read
  } catch (error) {
    await done
    throw error
  }
  await done
  return result
}

export async function runGit(args: string[], options: RunOptions): Promise<string> {
  const { stdout, done } = spawnGit(args, options)
  return readAll(
    (async () => {
      let out = ''
      for await (const chunk of text(stdout)) out += chunk
      return out
    })(),
    done,
  )
}

export async function runGitBytes(args: string[], options: RunOptions): Promise<Buffer> {
  const { stdout, done } = spawnGit(args, options)
  return readAll(
    (async () => {
      const chunks: Uint8Array[] = []
      for await (const chunk of stdout) chunks.push(chunk)
      return Buffer.concat(chunks)
    })(),
    done,
  )
}

export async function* streamGit(args: string[], options: RunOptions): AsyncIterable<string> {
  const { stdout, kill, done } = spawnGit(args, options)
  let finished = false
  try {
    for await (const chunk of text(stdout)) yield chunk
    finished = true
    await done
  } finally {
    // The reader left early (a closed page): stop git; its exit is dropped, since nobody waits for it.
    if (!finished) kill()
  }
}
