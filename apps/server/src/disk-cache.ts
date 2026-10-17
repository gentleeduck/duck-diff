import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { repoId } from '@duck-diff/git'

// Removes the cache of one repo, or of every repo; reviews and the repo list beside it stay.
export async function clearCaches(root: string, repo: string | null): Promise<number> {
  const ids = repo ? [repoId(repo)] : await readdir(root).catch(() => [])
  let cleared = 0
  for (const id of ids) {
    const dir = join(root, id, 'cache')
    if (!(await stat(dir).catch(() => null))) continue
    await rm(dir, { recursive: true, force: true })
    cleared++
  }
  return cleared
}

// Bumped when an entry's shape changes, so files from an older build are ignored rather than misread.
const VERSION = 1

export interface DiskCache {
  get<T>(bucket: string, key: string): Promise<T | null>
  set(bucket: string, key: string, value: unknown): void
  // Writes everything pending now; normally writes wait a moment and go out together.
  flush(): Promise<void>
  clear(bucket?: string): Promise<void>
}

interface Entry {
  value: unknown
  bytes: number
}

// Answers that are slow or costly to get again (GitHub reads, commits, the graph), kept on disk per repo the
// way Neovim plugins keep state in their data folder. Each bucket is one JSON file, least recently used first.
export function createDiskCache(
  root: string,
  { maxBytes = 20 * 1024 * 1024, flushMs = 500 }: { maxBytes?: number; flushMs?: number } = {},
): DiskCache {
  const dir = join(root, 'cache')
  const buckets = new Map<string, Promise<Map<string, Entry>>>()
  const dirty = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let generation = 0

  const fileOf = (bucket: string) => join(dir, `${bucket.replace(/[^\w-]/g, '_')}.json`)

  function open(bucket: string): Promise<Map<string, Entry>> {
    let loading = buckets.get(bucket)
    if (!loading) {
      loading = readFile(fileOf(bucket), 'utf8').then(
        (text) => {
          const map = new Map<string, Entry>()
          try {
            const parsed = JSON.parse(text) as { version?: number; entries?: [string, unknown][] }
            if (parsed.version !== VERSION || !Array.isArray(parsed.entries)) return map
            for (const [key, value] of parsed.entries) map.set(key, { value, bytes: JSON.stringify(value).length })
          } catch {}
          return map
        },
        () => new Map<string, Entry>(),
      )
      buckets.set(bucket, loading)
    }
    return loading
  }

  async function write(bucket: string) {
    const map = await open(bucket)
    const file = fileOf(bucket)
    await mkdir(dir, { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    await writeFile(
      temp,
      JSON.stringify({ version: VERSION, entries: [...map].map(([key, { value }]) => [key, value]) }),
    )
    await rename(temp, file)
  }

  async function flush() {
    if (timer) clearTimeout(timer)
    timer = null
    const pending = [...dirty]
    dirty.clear()
    await Promise.all(pending.map((bucket) => write(bucket).catch(() => {})))
  }

  return {
    async get<T>(bucket: string, key: string) {
      const map = await open(bucket)
      const entry = map.get(key)
      if (!entry) return null
      // Reading moves an entry to the young end of the line.
      map.delete(key)
      map.set(key, entry)
      return entry.value as T
    },
    set(bucket, key, value) {
      const at = generation
      void open(bucket).then((map) => {
        if (at !== generation) return
        map.delete(key)
        map.set(key, { value, bytes: JSON.stringify(value).length })
        let total = 0
        for (const entry of map.values()) total += entry.bytes
        for (const [old, entry] of map) {
          if (total <= maxBytes || old === key) break
          map.delete(old)
          total -= entry.bytes
        }
        dirty.add(bucket)
        timer ??= setTimeout(() => void flush(), flushMs)
      })
    },
    async flush() {
      // Sets still waiting on their bucket's first read land before the write.
      await Promise.all([...buckets.values()])
      await flush()
    },
    async clear(bucket) {
      generation++
      if (bucket) {
        buckets.set(bucket, Promise.resolve(new Map()))
        dirty.delete(bucket)
        await rm(fileOf(bucket), { force: true })
        return
      }
      buckets.clear()
      dirty.clear()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
