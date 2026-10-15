import { spawn } from 'node:child_process'
import { join } from 'node:path'

// Where a file opens, best first: the Neovim the server was started from, Neovim in a terminal in the page,
// a code editor, and last whatever the system opens files with.
export type Opener =
  | { how: 'nvim' }
  | { how: 'terminal' }
  | { how: 'editor'; command: string; args(file: string, line: number): string[] }
  | { how: 'system'; command: string; args(file: string, line: number): string[] }

const at = (file: string, line: number) => `${file}:${line}`
// Each editor's own way of going to a line.
const EDITORS: { command: string; args(file: string, line: number): string[] }[] = [
  { command: 'code', args: (file, line) => ['-g', at(file, line)] },
  { command: 'cursor', args: (file, line) => ['-g', at(file, line)] },
  { command: 'windsurf', args: (file, line) => ['-g', at(file, line)] },
  { command: 'zed', args: (file, line) => [at(file, line)] },
  { command: 'subl', args: (file, line) => [at(file, line)] },
]

export function pickOpener({
  nvim,
  which = (name: string) => Bun.which(name),
  platform = process.platform,
}: {
  nvim: string | null
  which?: (name: string) => string | null
  platform?: NodeJS.Platform
}): Opener {
  if (nvim) return { how: 'nvim' }
  if (which('nvim')) return { how: 'terminal' }
  const editor = EDITORS.find((entry) => which(entry.command))
  if (editor) return { how: 'editor', ...editor }
  return platform === 'darwin'
    ? { how: 'system', command: 'open', args: (file) => [file] }
    : { how: 'system', command: 'xdg-open', args: (file) => [file] }
}

// What the page does with Neovim in a terminal: the command it types into a new shell in the repo.
export const terminalCommand = (path: string, line: number) => `nvim +${line} -- '${path.replaceAll("'", "'\\''")}'`

// Starts an editor or the system opener on its own, so it outlives the server.
export function launch(
  opener: Extract<Opener, { how: 'editor' | 'system' }>,
  repo: string,
  path: string,
  line: number,
) {
  const child = spawn(opener.command, opener.args(join(repo, path), line), {
    cwd: repo,
    detached: true,
    stdio: 'ignore',
  })
  child.on('error', () => {})
  child.unref()
}
