import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const KEEP = 20

interface Entry {
  path: string
  existed: boolean
}

function defaultCache(): string {
  return process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache')
}

// Per-repo state lives outside the repo, one folder per repo, so it never shows up in git status.
export function repoId(repo: string): string {
  return createHash('sha1').update(repo).digest('hex').slice(0, 16)
}

function storeFor(repo: string, cache: string): string {
  return join(cache, 'duck-diff', repoId(repo), 'undo')
}

async function snapshots(store: string): Promise<string[]> {
  const names = await readdir(store).catch(() => [])
  return names.sort()
}

export async function snapshot(repo: string, paths: string[], cache = defaultCache()): Promise<void> {
  const store = storeFor(repo, cache)
  const existing = await snapshots(store)
  const sequence = String((Number(existing.at(-1)?.split('-')[0] ?? 0) || 0) + 1).padStart(10, '0')
  const dir = join(store, `${sequence}-${Date.now()}`)
  await mkdir(join(dir, 'files'), { recursive: true })
  const entries: Entry[] = []
  for (const [index, path] of paths.entries()) {
    const source = join(repo, path)
    const existed = await stat(source).then(
      (info) => info.isFile(),
      () => false,
    )
    if (existed) await copyFile(source, join(dir, 'files', String(index)))
    entries.push({ path, existed })
  }
  await writeFile(join(dir, 'entries.json'), JSON.stringify(entries))
  const all = await snapshots(store)
  for (const old of all.slice(0, Math.max(0, all.length - KEEP)))
    await rm(join(store, old), { recursive: true, force: true })
}

export async function restoreLatest(repo: string, cache = defaultCache()): Promise<string[] | null> {
  const store = storeFor(repo, cache)
  const latest = (await snapshots(store)).at(-1)
  if (!latest) return null
  const dir = join(store, latest)
  const entries: Entry[] = JSON.parse(await readFile(join(dir, 'entries.json'), 'utf8'))
  for (const [index, entry] of entries.entries()) {
    const target = join(repo, entry.path)
    if (entry.existed) {
      await mkdir(dirname(target), { recursive: true })
      await copyFile(join(dir, 'files', String(index)), target)
    } else {
      await rm(target, { force: true })
    }
  }
  await rm(dir, { recursive: true, force: true })
  return entries.map((entry) => entry.path)
}
