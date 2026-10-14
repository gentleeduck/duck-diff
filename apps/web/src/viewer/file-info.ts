import type { ChangedFile } from '@duck-diff/protocol'

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i

export function isImage(path: string): boolean {
  return IMAGE.test(path)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// The one line under a file name that explains why it looks different from a normal diff.
export function fileNote(file: ChangedFile): string | null {
  if (file.status === 'conflicted') return 'Merge conflict'
  if (file.binary) {
    const { oldSize, newSize } = file
    if (oldSize != null && newSize != null) return `Binary, ${formatBytes(oldSize)} to ${formatBytes(newSize)}`
    const size = newSize ?? oldSize
    return size != null ? `Binary, ${formatBytes(size)}` : 'Binary'
  }
  if (file.generated) return 'Generated'
  return null
}
