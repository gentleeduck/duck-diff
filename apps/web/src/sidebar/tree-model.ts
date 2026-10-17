export interface TreeRow {
  path: string
  name: string
  kind: 'file' | 'directory'
  depth: number
  // Paths of the visible rows above this one, outermost first; one indent guide each.
  ancestors: string[]
  expanded: boolean
  // The last item in its folder, where the folder's guide ends in an elbow.
  last: boolean
  // For each ancestor, whether it is the last item of its own folder; past such a folder its parent's
  // guide has nothing left to reach, so it is not drawn.
  ancestorsLast: boolean[]
}

interface Dir {
  path: string
  dirs: Map<string, Dir>
  files: string[]
}

const compare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

export function buildTree(paths: readonly string[]): Dir {
  const root: Dir = { path: '', dirs: new Map(), files: [] }
  for (const path of paths) {
    const parts = path.split('/')
    const file = parts.pop()
    if (!file) continue
    let dir = root
    for (const part of parts) {
      let next = dir.dirs.get(part)
      if (!next) {
        next = { path: dir.path ? `${dir.path}/${part}` : part, dirs: new Map(), files: [] }
        dir.dirs.set(part, next)
      }
      dir = next
    }
    dir.files.push(file)
  }
  return root
}

// Folders first, then files, each in natural order. Folders start open or closed by `open`; the paths in
// `toggled` are the ones flipped since.
export function visibleRows(root: Dir, toggled: ReadonlySet<string>, open = true): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (dir: Dir, ancestors: string[], ancestorsLast: boolean[]) => {
    const dirNames = [...dir.dirs.keys()].sort(compare)
    const lastDir = dir.files.length === 0 ? dirNames.at(-1) : undefined
    for (const name of dirNames) {
      // One row per folder, never a merged a/b/c: nvim-tree draws it so without group_empty.
      const child = dir.dirs.get(name) as Dir
      const expanded = open !== toggled.has(child.path)
      rows.push({
        path: child.path,
        name,
        kind: 'directory',
        depth: ancestors.length,
        ancestors,
        expanded,
        last: name === lastDir,
        ancestorsLast,
      })
      if (expanded) walk(child, [...ancestors, child.path], [...ancestorsLast, name === lastDir])
    }
    const files = [...dir.files].sort(compare)
    for (const [index, name] of files.entries()) {
      const path = dir.path ? `${dir.path}/${name}` : name
      rows.push({
        path,
        name,
        kind: 'file',
        depth: ancestors.length,
        ancestors,
        expanded: false,
        last: index === files.length - 1,
        ancestorsLast,
      })
    }
  }
  walk(root, [], [])
  return rows
}

// Paths in the order the tree shows its files, so the diff reads top to bottom like the tree.
export function treeOrder(paths: readonly string[]): Map<string, number> {
  const order = new Map<string, number>()
  for (const row of visibleRows(buildTree(paths), new Set())) if (row.kind === 'file') order.set(row.path, order.size)
  return order
}
