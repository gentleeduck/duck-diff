import type { Store } from '../lib/store'

interface FileStores {
  fileSelection: Store<string | null>
  fileLine: Store<number | null>
  fileAt: Store<string | null>
}

// Opens a file in the Files view, at a line and a commit when given; plain opens read the working tree.
export function openFile(stores: FileStores, path: string, options: { line?: number | null; at?: string | null } = {}) {
  stores.fileAt.set(options.at ?? null)
  stores.fileLine.set(options.line ?? null)
  stores.fileSelection.set(path)
}
