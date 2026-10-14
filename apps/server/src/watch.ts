import { watch } from 'node:fs'
import type { ChangeReason } from '@duck-diff/protocol'

const RANK: Record<ChangeReason, number> = { saved: 0, worktree: 1, index: 2, refs: 3 }

export function classifyPath(relative: string): ChangeReason | null {
  const path = relative.replaceAll('\\', '/')
  if (path.split('/').includes('node_modules')) return null
  if (!path.startsWith('.git/') && path !== '.git') return 'worktree'
  if (path.endsWith('.lock')) return null
  if (path === '.git/index') return 'index'
  if (path === '.git/HEAD' || path === '.git/packed-refs' || path.startsWith('.git/refs/')) return 'refs'
  return null
}

export function watchRepo(repo: string, onChange: (reason: ChangeReason) => void, debounceMs = 150): () => void {
  let pending: ChangeReason | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const watcher = watch(repo, { recursive: true }, (_event, filename) => {
    if (!filename) return
    const reason = classifyPath(filename.toString())
    if (!reason) return
    if (!pending || RANK[reason] > RANK[pending]) pending = reason
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const fired = pending
      pending = null
      timer = null
      if (fired) onChange(fired)
    }, debounceMs)
  })

  return () => {
    if (timer) clearTimeout(timer)
    watcher.close()
  }
}
