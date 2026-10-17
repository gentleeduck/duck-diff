import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Where duck-diff kept things before ~/.duck-diff: the XDG data folder (settings, comments, the repo list,
// caches) and the XDG cache (undo snapshots). Both move into home once; the Neovim plugin's binaries stay put.
export function moveOldData(home: string, env: NodeJS.ProcessEnv = process.env): number {
  const old = [
    join(env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'duck-diff'),
    join(env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'duck-diff'),
  ]
  let moved = 0
  for (const from of old) {
    if (from === home || !existsSync(from)) continue
    moved += mergeInto(from, home)
    removeEmpty(from)
  }
  return moved
}

// A folder both have is merged, an empty one is dropped instead of moved, and of a file both have the newer stays:
// a server still on an older build may have written the old copy after the move.
function mergeInto(from: string, to: string): number {
  mkdirSync(to, { recursive: true })
  let moved = 0
  for (const name of readdirSync(from)) {
    const source = join(from, name)
    const target = join(to, name)
    const folder = statSync(source, { throwIfNoEntry: false })?.isDirectory()
    if (folder === undefined) continue
    if (folder && readdirSync(source).length === 0) removeEmpty(source)
    else if (!existsSync(target)) moved += move(source, target)
    else if (folder) {
      moved += mergeInto(source, target)
      removeEmpty(source)
    } else if (statSync(source).mtimeMs > statSync(target).mtimeMs) {
      rmSync(target, { force: true })
      moved += move(source, target)
    } else rmSync(source, { force: true })
  }
  return moved
}

function move(source: string, target: string): number {
  try {
    renameSync(source, target)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    // Another server starting at the same moment moved it first.
    if (code === 'ENOENT') return 0
    if (code !== 'EXDEV') throw error
    cpSync(source, target, { recursive: true })
    rmSync(source, { recursive: true, force: true })
  }
  return 1
}

function removeEmpty(dir: string) {
  try {
    rmdirSync(dir)
  } catch {}
}
