import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { resolveRepo } from '@duck-diff/git'

export interface RepoEntry {
  path: string
  name: string
}

const LIMIT = 30
const defaultData = () => process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share')

// Repositories opened before, newest first, shared by every server so any page can switch between them.
export function createRepoList(dataDir = defaultData()) {
  const file = join(dataDir, 'duck-diff', 'repos.json')
  const read = async (): Promise<string[]> => {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
    } catch {
      return []
    }
  }
  const write = async (paths: string[]) => {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(paths.slice(0, LIMIT), null, 2))
  }
  return {
    async all(): Promise<RepoEntry[]> {
      return (await read()).map((path) => ({ path, name: basename(path) }))
    },
    // Only a real repository goes in, by its top folder, so a typo never lands in the list.
    async add(path: string): Promise<string> {
      const root = await resolveRepo(path)
      await write([root, ...(await read()).filter((entry) => entry !== root)])
      return root
    },
    async remove(path: string): Promise<void> {
      await write((await read()).filter((entry) => entry !== path))
    },
  }
}
