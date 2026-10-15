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

function spawnGit(args: string[], options: RunOptions) {
  const env = options.env ? { ...ENV, ...options.env } : ENV
  const child = spawn('git', args, { cwd: options.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  if (options.input !== undefined) child.stdin.end(options.input)
  else if (!options.holdStdin) child.stdin.end()
  let stderr = ''
  let timedOut = false
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })
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
  for await (const chunk of child.stdout) yield chunk as string
  await done
}
