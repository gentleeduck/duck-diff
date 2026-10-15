import { type Stats, statSync, unwatchFile, watchFile } from 'node:fs'

// mtime, size and inode: an install that moves a new file into place changes at least one.
const stamp = (info: Stats) => `${info.mtimeMs}:${info.size}:${info.ino}`

// Calls onChange once a new build has been written over the binary and has stopped changing.
export function watchBinary(path: string, onChange: () => void, intervalMs = 1500): () => void {
  let first: string
  try {
    first = stamp(statSync(path))
  } catch {
    return () => {}
  }
  let fired = false
  const listener = (current: Stats) => {
    if (fired || current.size === 0 || stamp(current) === first) return
    fired = true
    onChange()
  }
  watchFile(path, { interval: intervalMs }, listener)
  return () => unwatchFile(path, listener)
}

// The build this server runs, so a page can tell when the server under it has been replaced.
export function buildStamp(path: string): string {
  try {
    return stamp(statSync(path))
  } catch {
    return 'unknown'
  }
}
