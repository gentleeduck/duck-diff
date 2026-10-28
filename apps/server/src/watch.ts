import { type FSWatcher, watch } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit } from '@duck-diff/git'
import type { ChangeReason } from '@duck-diff/protocol'

// Comment changes come from the api, never from the file system.
type RepoChange = Exclude<ChangeReason, 'reviews'>

const RANK: Record<RepoChange, number> = { saved: 0, worktree: 1, index: 2, refs: 3 }

export function classifyPath(relative: string): RepoChange | null {
  const path = relative.replaceAll('\\', '/')
  if (path.split('/').includes('node_modules')) return null
  if (!path.startsWith('.git/') && path !== '.git') return 'worktree'
  if (path.endsWith('.lock')) return null
  if (path === '.git/index') return 'index'
  // Remotes and the branches' upstreams live in .git/config.
  if (path === '.git/HEAD' || path === '.git/packed-refs' || path === '.git/config' || path.startsWith('.git/refs/'))
    return 'refs'
  return null
}

export type RepoWatch = (() => void) & { ready: Promise<void> }

// Folders git tracks or would list as untracked, plus every folder above them; ignored trees such as
// node_modules are never walked, which keeps start-up fast in large repos.
export async function watchedFolders(repo: string): Promise<string[]> {
  const out = await runGit(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repo })
  const folders = new Set<string>(['.'])
  for (const path of out.split('\0')) {
    let at = path.lastIndexOf('/')
    while (at > 0) {
      const folder = path.slice(0, at)
      if (folders.has(folder)) break
      folders.add(folder)
      at = folder.lastIndexOf('/')
    }
  }
  return [...folders]
}

async function isIgnored(repo: string, folder: string): Promise<boolean> {
  const out = await runGit(['check-ignore', '--', folder], { cwd: repo, okExitCodes: [1] }).catch(() => '')
  return out.trim() !== ''
}

export function watchRepo(repo: string, onChange: (reason: RepoChange) => void, debounceMs = 150): RepoWatch {
  let pending: RepoChange | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let closed = false
  const watchers = new Map<string, FSWatcher>()

  const report = (relative: string) => {
    const reason = classifyPath(relative)
    if (!reason) return
    if (!pending || RANK[reason] > RANK[pending]) pending = reason
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const fired = pending
      pending = null
      timer = null
      if (fired) onChange(fired)
    }, debounceMs)
  }

  const add = (folder: string, recursive = false) => {
    if (closed || watchers.has(folder)) return
    try {
      const watcher = watch(join(repo, folder), { recursive }, (event, filename) => {
        if (!filename) return
        const relative = folder === '.' ? filename.toString() : `${folder}/${filename}`
        report(relative)
        // A folder created after start-up gets its own watcher unless git ignores it.
        if (event === 'rename' && !relative.startsWith('.git')) void follow(relative)
      })
      watcher.on('error', () => {
        watcher.close()
        watchers.delete(folder)
      })
      watchers.set(folder, watcher)
    } catch {
      // The folder went away between listing and watching; nothing to watch.
    }
  }

  const follow = async (relative: string) => {
    const isFolder = await stat(join(repo, relative)).then(
      (info) => info.isDirectory(),
      () => false,
    )
    if (isFolder && !(await isIgnored(repo, relative))) add(relative)
  }

  add('.git')
  add('.git/refs', true)
  const ready = watchedFolders(repo).then(
    (folders) => {
      for (const folder of folders) add(folder)
    },
    () => add('.'),
  )

  return Object.assign(
    () => {
      closed = true
      if (timer) clearTimeout(timer)
      for (const watcher of watchers.values()) watcher.close()
      watchers.clear()
    },
    { ready },
  )
}
