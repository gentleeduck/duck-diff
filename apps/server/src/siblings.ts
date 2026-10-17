import { type ChildProcess, spawn } from 'node:child_process'
import { HandshakeSchema } from '@duck-diff/protocol'
import { openBrowser } from './instance'
import { evalNvim, luaCall, type NvimEval } from './nvim'

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
      // It lives as long as this process (cli.ts), whose pid stays when it restarts in place for a new build.
      const child = spawn(program, args, {
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, DUCK_DIFF_PARENT: String(process.pid) },
      })
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

// One sibling per path, reused while it runs and stopped with this server. find gives the page of one still
// running from before this server restarted in place, which serves on instead of a second.
export function createSiblings(start: StartServer, find: (path: string) => Promise<string | null> = async () => null) {
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
        const kept = await find(path)
        if (kept) return kept
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
    // keep: this server is only handing over to a new build of itself, and they serve on under it.
    async stop({ keep = false }: { keep?: boolean } = {}) {
      if (keep) return
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

// A sibling's page opens the way this server's own did: through the Neovim plugin, which honours its open
// setting, or as the command line opens one (an app window). A plugin too old to answer gets the latter.
export function pageOpener(
  nvim: string | null,
  { evaluate = evalNvim, browser = openBrowser }: { evaluate?: NvimEval; browser?: (url: string) => boolean } = {},
): (url: string) => Promise<boolean> {
  return async (url) => {
    if (nvim) {
      try {
        await evaluate(nvim, luaCall('duck-diff.open', 'page', url))
        return true
      } catch {}
    }
    return browser(url)
  }
}
