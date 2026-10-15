export interface TreeRow {
  path: string
  // A chain of single-folder directories shows as one row, "a/b/c".
  name: string
  kind: 'file' | 'directory'
  depth: number
  // Paths of the visible rows above this one, outermost first; one indent guide each.
  ancestors: string[]
  expanded: boolean
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
  const walk = (dir: Dir, ancestors: string[]) => {
    for (const name of [...dir.dirs.keys()].sort(compare)) {
      let child = dir.dirs.get(name) as Dir
      let label = name
      while (child.files.length === 0 && child.dirs.size === 1) {
        const [[next, only]] = child.dirs as unknown as [[string, Dir]]
        label = `${label}/${next}`
        child = only
      }
      const expanded = open !== toggled.has(child.path)
      rows.push({ path: child.path, name: label, kind: 'directory', depth: ancestors.length, ancestors, expanded })
      if (expanded) walk(child, [...ancestors, child.path])
    }
    for (const name of [...dir.files].sort(compare)) {
      const path = dir.path ? `${dir.path}/${name}` : name
      rows.push({ path, name, kind: 'file', depth: ancestors.length, ancestors, expanded: false })
    }
  }
  walk(root, [])
  return rows
}

// Paths in the order the tree shows its files, so the diff reads top to bottom like the tree.
export function treeOrder(paths: readonly string[]): Map<string, number> {
  const order = new Map<string, number>()
  for (const row of visibleRows(buildTree(paths), new Set())) if (row.kind === 'file') order.set(row.path, order.size)
  return order
}
