import { type ChildProcess, spawn } from 'node:child_process'
import { HandshakeSchema } from '@duck-diff/protocol'

// Starts a server for another checkout (a worktree or a submodule) and returns the url it prints.
export type StartServer = (repo: string) => Promise<{ url: string; child: ChildProcess | null }>

// A compiled binary is its own server; from source the script runs under bun.
function selfCommand(): string[] {
  return Bun.main.includes('$bunfs') ? [process.execPath] : [process.execPath, Bun.main]
}

export function startSibling(nvim: string | null): StartServer {
  return (repo) =>
    new Promise((resolve, reject) => {
      const [program = process.execPath, ...base] = selfCommand()
      const args = [...base, 'serve', '--repo', repo, ...(nvim ? ['--nvim', nvim] : [])]
      // stdin stays open: when this server exits, the pipe closes and the sibling follows.
      const child = spawn(program, args, { stdio: ['pipe', 'pipe', 'ignore'] })
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('the other server did not start'))
      }, 15_000)
      child.on('error', reject)
      child.stdout?.once('data', (chunk: Buffer) => {
        clearTimeout(timer)
        try {
          resolve({ url: HandshakeSchema.parse(JSON.parse(chunk.toString().split('\n')[0] ?? '')).url, child })
        } catch (error) {
          child.kill()
          reject(error)
        }
      })
    })
}

// One sibling per path, reused while it runs and stopped with this server.
export function createSiblings(start: StartServer) {
  const running = new Map<string, Promise<{ url: string; child: ChildProcess | null }>>()
  return {
    async open(path: string): Promise<string> {
      const existing = running.get(path)
      const alive =
        existing &&
        (await existing.then(
          (sibling) => sibling.child?.exitCode === null,
          () => false,
        ))
      if (!existing || !alive) {
        const next = start(path)
        running.set(path, next)
        next.catch(() => running.delete(path))
        void next.then(
          ({ child }) => child?.on('exit', () => running.delete(path)),
          () => {},
        )
        return (await next).url
      }
      return (await existing).url
    },
    // Waits for them to exit, so whoever stopped this server can remove what they wrote; a stuck one gets 5s.
    async stop() {
      const exits = [...running.values()].map((sibling) =>
        sibling.then(
          ({ child }) =>
            new Promise<void>((resolve) => {
              if (!child || child.exitCode !== null || child.signalCode !== null) return resolve()
              child.once('exit', () => resolve())
              child.kill()
            }),
          () => {},
        ),
      )
      running.clear()
      await Promise.race([Promise.all(exits), Bun.sleep(5000)])
    },
  }
}
