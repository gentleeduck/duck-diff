import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { EditorChoice } from '@duck-diff/protocol'

// Where a file opens, best first: the Neovim the server was started from (the plugin), a code editor with
// VS Code first, and last whatever the system opens files with. Never a terminal in the page.
export type Opener =
  | { how: 'nvim' }
  | { how: 'editor'; command: string; args(file: string, line: number): string[] }
  | { how: 'system'; command: string; args(file: string, line: number): string[] }

const at = (file: string, line: number) => `${file}:${line}`
const goTo = (file: string, line: number) => ['-g', at(file, line)]
// Each editor's own way of going to a line.
const EDITORS: { command: string; args(file: string, line: number): string[] }[] = [
  { command: 'code', args: goTo },
  { command: 'code-insiders', args: goTo },
  { command: 'codium', args: goTo },
  { command: 'cursor', args: goTo },
  { command: 'windsurf', args: goTo },
  { command: 'zed', args: (file, line) => [at(file, line)] },
  { command: 'subl', args: (file, line) => [at(file, line)] },
]
// VS Code on a Mac is often installed without its `code` command on the PATH; the app carries it.
const MAC_VSCODE = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'

// An editor picked in the settings is used or reported missing, never swapped for another behind the user's back.
export function pickOpener({
  nvim,
  prefer = 'auto',
  which = (name: string) => Bun.which(name),
  platform = process.platform,
  exists = existsSync,
}: {
  nvim: string | null
  prefer?: EditorChoice
  which?: (name: string) => string | null
  platform?: NodeJS.Platform
  exists?: (path: string) => boolean
}): Opener {
  if (prefer === 'nvim') {
    if (nvim) return { how: 'nvim' }
    throw new Error('Neovim is not attached: start duck-diff from Neovim to open files there')
  }
  if (prefer !== 'auto') {
    const chosen = EDITORS.find((entry) => entry.command === prefer)
    if (chosen && which(chosen.command)) return { how: 'editor', ...chosen }
    if (prefer === 'code' && platform === 'darwin' && exists(MAC_VSCODE))
      return { how: 'editor', command: MAC_VSCODE, args: goTo }
    throw new Error(`${prefer} is not on the PATH`)
  }
  if (nvim) return { how: 'nvim' }
  const editor = EDITORS.find((entry) => which(entry.command))
  if (editor && editor.command === 'code') return { how: 'editor', ...editor }
  if (platform === 'darwin' && exists(MAC_VSCODE)) return { how: 'editor', command: MAC_VSCODE, args: goTo }
  if (editor) return { how: 'editor', ...editor }
  return platform === 'darwin'
    ? { how: 'system', command: 'open', args: (file) => [file] }
    : { how: 'system', command: 'xdg-open', args: (file) => [file] }
}

// Starts an editor or the system opener on its own, so it outlives the server. Rejects when it cannot start,
// so the page never says a file opened that did not.
export function launch(
  opener: Extract<Opener, { how: 'editor' | 'system' }>,
  repo: string,
  path: string,
  line: number,
): Promise<void> {
  const child = spawn(opener.command, opener.args(join(repo, path), line), {
    cwd: repo,
    detached: true,
    stdio: 'ignore',
  })
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
