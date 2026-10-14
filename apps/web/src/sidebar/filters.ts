import type { ChangedFile, FileStatus } from '@duck-diff/protocol'
import type { GitStatus } from '@pierre/trees'

export type TreeStatus = Exclude<GitStatus, 'ignored'>

const TREE_STATUS: Record<FileStatus, TreeStatus> = {
  added: 'added',
  copied: 'added',
  modified: 'modified',
  'type-changed': 'modified',
  deleted: 'deleted',
  renamed: 'renamed',
  untracked: 'untracked',
}

export function toGitStatus(status: FileStatus): TreeStatus {
  return TREE_STATUS[status]
}

export function filterFiles(files: readonly ChangedFile[], statuses: ReadonlySet<TreeStatus>, query: string) {
  const needle = query.trim().toLowerCase()
  return files.filter(
    (file) =>
      (statuses.size === 0 || statuses.has(toGitStatus(file.status))) &&
      (needle === '' || file.path.toLowerCase().includes(needle)),
  )
}

export function countByStatus(files: readonly ChangedFile[]): Partial<Record<TreeStatus, number>> {
  const counts: Partial<Record<TreeStatus, number>> = {}
  for (const file of files) {
    const status = toGitStatus(file.status)
    counts[status] = (counts[status] ?? 0) + 1
  }
  return counts
}
