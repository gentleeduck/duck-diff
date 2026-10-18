import { spawn } from 'node:child_process'
import type { ToolState } from '@duck-diff/protocol'
import { type Instance, liveInstance, openBrowser, pageUrl } from './instance'
import type { ToolStart } from './tools'

// What git sets for the command it runs, which a server outliving that command must not keep: they would point
// its git at this one moment of this one repo.
const MOMENTARY = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_REFLOG_ACTION',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_QUARANTINE_PATH',
  'GIT_EDITOR',
  'GIT_SEQUENCE_EDITOR',
  'GIT_CHERRY_PICK_HELP',
]

// The server for this repo, started in the background when none runs: git runs a tool once per file, and every
// run shares the one server and its window. It stops by itself a while after its last window closes.
export async function ensureServer(record: string, repo: string, self: string[]): Promise<Instance> {
  const running = await liveInstance(record)
  if (running) return running
  const env = { ...process.env }
  for (const name of MOMENTARY) delete env[name]
  const [command = 'duck-diff', ...rest] = self
  const child = spawn(command, [...rest, 'merge', '-C', repo, '--no-open', '--idle-timeout-ms', '120000'], {
    cwd: repo,
    env,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  for (let tries = 0; tries < 150; tries++) {
    await Bun.sleep(100)
    const started = await liveInstance(record)
    if (started) return started
  }
  throw new Error('the duck-diff server did not start')
}

export class ToolError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(instance: Instance, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${instance.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-duck-diff-token': instance.token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text()
    let message = text
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text
    } catch {}
    throw new ToolError(response.status, message)
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

export interface ToolRun {
  start: ToolStart
  // The page the window opens on.
  page: string
  // Done without the page saying so, as a conflicted file is once it is staged.
  settled?: () => Promise<boolean>
  say(text: string): void
}

// How long a tool waits after its window has gone before giving up on it.
const GONE_MS = 5000

// Starts the tool on the server, opens a window for it unless one is already open, and waits until it is done.
export async function runTool(instance: Instance, run: ToolRun): Promise<boolean> {
  const { id, pages } = await call<{ id: string; pages: number }>(instance, '/api/tool/start', run.start)
  const url = pageUrl(instance, `${run.page}?tool=${id}`)
  if (!pages && !openBrowser(url)) run.say(`Open ${url}`)
  let seen = pages > 0
  let goneSince = 0
  for (;;) {
    if (run.settled && (await run.settled())) {
      await call(instance, '/api/tool/finish', { id, ok: true }).catch(() => {})
      return true
    }
    const state = await call<ToolState>(instance, `/api/tool/state?id=${id}`)
    if (state.done) return state.ok
    if (state.pages > 0) {
      seen = true
      goneSince = 0
    } else if (seen) {
      goneSince ||= Date.now()
      if (Date.now() - goneSince > GONE_MS) return false
    }
    await Bun.sleep(400)
  }
}
