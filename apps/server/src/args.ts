import { resolve } from 'node:path'
import pkg from '../package.json' with { type: 'json' }

export const VERSION: string = pkg.version

export type Command =
  | { name: 'serve'; repo: string; port: number; idleTimeoutMs: number; nvim: string | null }
  | { name: 'version' }
  | { name: 'help' }

export const USAGE = `usage:
  duck-diff serve [--repo <path>] [--port <n>] [--idle-timeout-ms <n>] [--nvim <address>]
  duck-diff --version`

function wholeNumber(flag: string, value: string | undefined): number {
  const parsed = Number(value)
  if (value === undefined || !Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} needs a whole number`)
  return parsed
}

export function parseArgs(argv: string[], cwd: string): Command {
  const [command, ...rest] = argv
  if (command === undefined || command === 'help' || command === '--help') return { name: 'help' }
  if (command === '--version' || command === 'version') return { name: 'version' }
  if (command !== 'serve') throw new Error(USAGE)

  const result = { name: 'serve' as const, repo: cwd, port: 0, idleTimeoutMs: 600_000, nvim: null as string | null }
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i]
    const value = rest[i + 1]
    if (flag === '--repo' && value) result.repo = resolve(cwd, value)
    else if (flag === '--port') result.port = wholeNumber('--port', value)
    else if (flag === '--nvim' && value) result.nvim = value
    else if (flag === '--idle-timeout-ms') result.idleTimeoutMs = wholeNumber('--idle-timeout-ms', value)
    else throw new Error(USAGE)
  }
  return result
}
