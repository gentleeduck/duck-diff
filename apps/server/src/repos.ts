import { existsSync } from 'node:fs'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { duckHome, resolveRepo } from '@duck-diff/git'
import { HttpError } from './errors'

export interface RepoEntry {
  path: string
  name: string
}

const LIMIT = 30
// A lock this old was left by a server that died holding it.
const STALE_LOCK_MS = 5000

async function lock(path: string): Promise<() => Promise<void>> {
  for (;;) {
    try {
      await (await open(path, 'wx')).close()
      return () => rm(path, { force: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const held = await stat(path).catch(() => null)
      if (held && Date.now() - held.mtimeMs > STALE_LOCK_MS) await rm(path, { force: true })
      await new Promise((resolve) => setTimeout(resolve, 15))
    }
  }
}

// Repositories opened before, newest first, shared by every server so any page can switch between them.
export function createRepoList(dataDir = duckHome()) {
  const file = join(dataDir, 'repos.json')
  const read = async (): Promise<string[]> => {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
    } catch {
      return []
    }
  }
  // One change at a time across every server, each read fresh under a lock and written whole with a rename, so a
  // repository another server adds meanwhile is never dropped and no one reads a half-written list.
  const update = async (change: (paths: string[]) => string[]): Promise<void> => {
    await mkdir(dirname(file), { recursive: true })
    const release = await lock(`${file}.lock`)
    try {
      const temp = `${file}.${process.pid}.tmp`
      await writeFile(temp, JSON.stringify(change(await read()).slice(0, LIMIT), null, 2))
      await rename(temp, file)
    } finally {
      await release()
    }
  }
  return {
    // A folder deleted since (a removed checkout, a test repo) drops out and frees its place.
    async all(): Promise<RepoEntry[]> {
      const paths = await read()
      const gone = new Set(paths.filter((path) => !existsSync(path)))
      if (gone.size) await update((now) => now.filter((path) => !gone.has(path)))
      return paths.filter((path) => !gone.has(path)).map((path) => ({ path, name: basename(path) }))
    },
    // Only a real repository goes in, by its top folder, so a typo never lands in the list.
    async add(path: string): Promise<string> {
      // Git's own answer for a missing folder is that it failed to start, which says nothing useful.
      if (!existsSync(path)) throw new HttpError(400, 'bad-request', `No folder at ${path}`)
      const root = await resolveRepo(path)
      await update((now) => [root, ...now.filter((entry) => entry !== root)])
      return root
    },
    async remove(path: string): Promise<void> {
      await update((now) => now.filter((entry) => entry !== path))
    },
  }
}
