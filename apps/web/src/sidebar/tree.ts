import type { ChangedFile } from '@duck-diff/protocol'

export type TreeNode =
  | { kind: 'folder'; name: string; path: string; children: TreeNode[] }
  | { kind: 'file'; name: string; path: string; file: ChangedFile }

interface Draft {
  folders: Map<string, Draft>
  files: ChangedFile[]
}

function toNodes(draft: Draft, prefix: string): TreeNode[] {
  const folders = [...draft.folders].sort(([a], [b]) => a.localeCompare(b))
  const nodes: TreeNode[] = folders.map(([name, child]) => {
    let label = name
    let inner = child
    // A folder holding just one folder reads better as a single `a/b/c` row.
    while (inner.files.length === 0 && inner.folders.size === 1) {
      const [[next, deeper]] = [...inner.folders] as [[string, Draft]]
      label = `${label}/${next}`
      inner = deeper
    }
    const path = prefix ? `${prefix}/${label}` : label
    return { kind: 'folder', name: label, path, children: toNodes(inner, path) }
  })
  const files = [...draft.files].sort((a, b) => a.path.localeCompare(b.path))
  for (const file of files)
    nodes.push({ kind: 'file', name: file.path.split('/').pop() ?? file.path, path: file.path, file })
  return nodes
}

export function buildTree(files: readonly ChangedFile[]): TreeNode[] {
  const root: Draft = { folders: new Map(), files: [] }
  for (const file of files) {
    let draft = root
    for (const part of file.path.split('/').slice(0, -1)) {
      let next = draft.folders.get(part)
      if (!next) {
        next = { folders: new Map(), files: [] }
        draft.folders.set(part, next)
      }
      draft = next
    }
    draft.files.push(file)
  }
  return toNodes(root, '')
}
