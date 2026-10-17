import { basename } from 'node:path'

// A page's view of one terminal: raw output bytes, and small control messages as JSON.
export interface TerminalPeer {
  output(data: Uint8Array): void
  control(message: { type: 'exit'; code: number }): void
}

export interface TerminalInfo {
  id: string
  title: string
  cwd: string
}

export interface TerminalSession extends TerminalInfo {
  attach(peer: TerminalPeer): void
  detach(peer: TerminalPeer): void
  input(data: string): void
  resize(cols: number, rows: number): void
  close(): void
}

export interface Terminals {
  open(size: { cols: number; rows: number; cwd?: string }): TerminalSession
  get(id: string): TerminalSession | null
  list(): TerminalInfo[]
  dispose(): void
}

interface Options {
  cwd: string
  shell?: string
  args?: string[]
  // Bytes of output kept for a page that attaches later, after a reload.
  scrollback?: number
  // A terminal no page has shown for this long is closed.
  idleMs?: number
  // Output is gathered this long before it is sent, so a flood becomes a few large frames.
  flushMs?: number
}

const CLAIM_TTY = 't=$(tty) && exec 0<>"$t" 1>&0 2>&0; exec "$0" "$@"'

const clampSize = (value: number, max: number) => Math.max(2, Math.min(max, Math.floor(value) || 2))

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

export function createTerminals({
  cwd: root,
  shell = process.env.SHELL || '/bin/sh',
  args = ['-l'],
  scrollback = 256 * 1024,
  idleMs = 10 * 60_000,
  flushMs = 8,
}: Options): Terminals {
  const sessions = new Map<string, TerminalSession>()
  let counter = 0

  function open({ cols, rows, cwd = root }: { cols: number; rows: number; cwd?: string }): TerminalSession {
    const id = `term-${Date.now().toString(36)}-${(counter++).toString(36)}`
    const peers = new Set<TerminalPeer>()
    let kept: Uint8Array[] = []
    let keptBytes = 0
    let pending: Uint8Array[] = []
    let pendingBytes = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    let idle: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const flush = () => {
      timer = null
      if (!pendingBytes) return
      const data = concat(pending, pendingBytes)
      pending = []
      pendingBytes = 0
      for (const peer of peers) peer.output(data)
    }
    const keep = (data: Uint8Array) => {
      kept.push(data)
      keptBytes += data.length
      while (keptBytes - (kept[0]?.length ?? 0) >= scrollback && kept.length > 1) {
        keptBytes -= kept.shift()?.length ?? 0
      }
    }
    const watchIdle = () => {
      if (idle) clearTimeout(idle)
      idle = peers.size === 0 ? setTimeout(() => session.close(), idleMs) : null
    }

    const terminal = new Bun.Terminal({
      cols: clampSize(cols, 1000),
      rows: clampSize(rows, 500),
      name: 'xterm-256color',
      data(_terminal, data) {
        const copy = new Uint8Array(data)
        keep(copy)
        pending.push(copy)
        pendingBytes += copy.length
        timer ??= setTimeout(flush, flushMs)
      },
    })
    const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'duck-diff' }
    // Its own session, with the pty as its controlling terminal, so Ctrl+C, Ctrl+Z and job control reach what runs
    // in it as in any terminal; without one ^C only prints. bash takes the terminal on its own and zsh does not, so
    // the session opens it by name first (which makes it the controlling one), then becomes the shell.
    const child = Bun.spawn(['/bin/sh', '-c', CLAIM_TTY, shell, ...args], { cwd, env, terminal, detached: true })
    child.exited.then((code) => {
      if (timer) clearTimeout(timer)
      flush()
      for (const peer of peers) peer.control({ type: 'exit', code })
      session.close()
    })

    const session: TerminalSession = {
      id,
      title: basename(shell),
      cwd,
      attach(peer) {
        peers.add(peer)
        watchIdle()
        // The page starts from what was printed before it came, trimmed to whole lines.
        if (!keptBytes) return
        let replay = concat(kept, keptBytes)
        if (replay.length > scrollback) {
          replay = replay.subarray(replay.length - scrollback)
          const newline = replay.indexOf(10)
          if (newline !== -1) replay = replay.subarray(newline + 1)
        }
        peer.output(replay)
      },
      detach(peer) {
        peers.delete(peer)
        watchIdle()
      },
      input(data) {
        if (!closed) terminal.write(data)
      },
      resize(nextCols, nextRows) {
        if (!closed) terminal.resize(clampSize(nextCols, 1000), clampSize(nextRows, 500))
      },
      close() {
        if (closed) return
        closed = true
        if (idle) clearTimeout(idle)
        if (timer) clearTimeout(timer)
        sessions.delete(id)
        peers.clear()
        kept = []
        // The hangup a closing terminal sends, which an interactive shell passes on to its jobs. The pty closes once
        // the shell is gone: closed at the same moment, the shell can die before it has told its jobs.
        child.kill('SIGHUP')
        const shut = setTimeout(() => {
          child.kill('SIGKILL')
          terminal.close()
        }, 2000)
        void child.exited.then(() => {
          clearTimeout(shut)
          terminal.close()
        })
      },
    }
    sessions.set(id, session)
    watchIdle()
    return session
  }

  return {
    open,
    get: (id) => sessions.get(id) ?? null,
    list: () => [...sessions.values()].map(({ id, title, cwd }) => ({ id, title, cwd })),
    dispose() {
      for (const session of [...sessions.values()]) session.close()
    },
  }
}
