import { spawn } from 'node:child_process'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { repoId } from '@duck-diff/git'

// The server running for a repo, written where its other state lives, so a second `duck-diff` opens a
// tab on it instead of starting another.
export interface Instance {
  pid: number
  port: number
  token: string
}

export const instanceFile = (data: string, repo: string) => join(data, 'duck-diff', repoId(repo), 'server.json')

export async function writeInstance(file: string, instance: Instance) {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(instance))
  await rename(temp, file)
}

// Only this process's own record goes; a newer server may have written its own since.
export async function removeInstance(file: string, pid: number) {
  const current = await readInstance(file)
  if (current?.pid === pid) await rm(file, { force: true })
}

async function readInstance(file: string): Promise<Instance | null> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<Instance>
    if (typeof parsed.pid !== 'number' || typeof parsed.port !== 'number' || typeof parsed.token !== 'string')
      return null
    return { pid: parsed.pid, port: parsed.port, token: parsed.token }
  } catch {
    return null
  }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// The recorded server, if it is still running and still answers with its token.
export async function liveInstance(file: string): Promise<Instance | null> {
  const instance = await readInstance(file)
  if (!instance || !alive(instance.pid)) return null
  try {
    const response = await fetch(`http://127.0.0.1:${instance.port}/api/repo`, {
      headers: { 'x-duck-diff-token': instance.token },
      signal: AbortSignal.timeout(1500),
    })
    return response.ok ? instance : null
  } catch {
    return null
  }
}

export const pageUrl = (instance: Pick<Instance, 'port' | 'token'>, path: string) =>
  `http://127.0.0.1:${instance.port}${path}${path.includes('?') ? '&' : '?'}token=${instance.token}`

// The system's way of opening a link: $BROWSER first, as many tools honor it.
export function openBrowser(url: string): boolean {
  const browser = process.env.BROWSER?.split(':')[0]
  const [command, ...args] = browser
    ? [browser, url]
    : process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '""', url]
        : ['xdg-open', url]
  try {
    const child = spawn(command as string, args, { detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}
