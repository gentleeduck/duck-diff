import { resolve } from 'node:path'
import type { DiffTarget } from '@duck-diff/protocol'
import pkg from '../package.json' with { type: 'json' }

export const VERSION: string = pkg.version

export type Command =
  | {
      name: 'serve'
      repo: string
      more: string[]
      port: number
      idleTimeoutMs: number
      nvim: string | null
      terminal: boolean
    }
  | {
      name: 'open'
      repo: string
      // The page to open: a path with its query, without the token.
      path: string
      port: number
      idleTimeoutMs: number
      terminal: boolean
      // False prints the url instead of opening a browser.
      browser: boolean
    }
  | { name: 'version' }
  | { name: 'cache-clear'; repo: string | null }
  | { name: 'update'; version: string | null }
  | { name: 'help'; topic: string | null }

// Views opened by name; anything else is a diff target, as `:DuckDiff` reads it.
const VIEWS = [
  'graph',
  'files',
  'prs',
  'issues',
  'inbox',
  'releases',
  'actions',
  'discussions',
  'security',
  'insights',
  'merge',
] as const
type View = (typeof VIEWS)[number]

export const COMMANDS = [...VIEWS, 'diff', 'serve', 'update', 'cache', 'help', 'version'] as const

function wholeNumber(flag: string, value: string | undefined): number {
  const parsed = Number(value)
  if (value === undefined || !Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} needs a whole number`)
  return parsed
}

function ref(name: string): string {
  if (!name || name.startsWith('-') || /\s/.test(name)) throw new Error(`"${name}" is not a ref`)
  return name
}

// The same reading as the Neovim plugin's lua/duck-diff/target.lua, so both open the same diff.
export function parseTarget(words: string[]): DiffTarget {
  const text = words.join(' ').trim()
  if (text === '' || text === 'local') return { kind: 'local' }
  if (text === 'staged' || text === 'unstaged') return { kind: text }
  const commit = /^commit\s*(.*)$/.exec(text)
  if (commit) return { kind: 'commit', sha: commit[1] ? ref(commit[1]) : 'HEAD' }
  const merge = /^(.+?)\.\.\.(.+)$/.exec(text)
  if (merge) return { kind: 'range', from: ref(merge[1] as string), to: ref(merge[2] as string), mode: 'merge-base' }
  const two = /^(.+?)\.\.(.+)$/.exec(text)
  if (two) return { kind: 'range', from: ref(two[1] as string), to: ref(two[2] as string), mode: 'two-dot' }
  // A bare ref means what this branch adds on top of it, the pull request view.
  return { kind: 'range', from: ref(text), to: 'HEAD', mode: 'merge-base' }
}

const query = (params: Record<string, string | null>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== null) search.set(key, value)
  const text = search.toString()
  return text ? `?${text}` : ''
}

function viewPath(view: View, args: string[]): string {
  const [first] = args
  if (args.length > 1) throw new Error(`${view} takes at most one argument`)
  if (view === 'prs' || view === 'issues') {
    if (first === undefined) return `/${view}`
    const number = Number(first.replace(/^#/, ''))
    if (!Number.isInteger(number) || number <= 0) throw new Error(`${view} needs a number, like ${view} 12`)
    return `/${view}/${number}`
  }
  if (view === 'files' && first) {
    // path:line opens the file at that line, as editors take it.
    const at = /^(.+?):(\d+)$/.exec(first)
    return `/files${query({ file: at ? (at[1] as string) : first, line: at ? (at[2] as string) : null })}`
  }
  if (first !== undefined) throw new Error(`${view} takes no argument`)
  return `/${view}`
}

const diffPath = (target: DiffTarget) =>
  target.kind === 'local' ? '/changes' : `/changes${query({ target: JSON.stringify(target) })}`

const FLAGS_WITH_VALUES = new Set(['-C', '--repo', '-p', '--port', '--nvim', '--idle-timeout-ms'])

export function parseArgs(argv: string[], cwd: string): Command {
  // Flags may come anywhere, as in git; what is left are the command and its words.
  const words: string[] = []
  const flags: Record<string, string | true> = {}
  const repos: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (arg === '--') {
      words.push(...argv.slice(i + 1))
      break
    }
    if (!arg.startsWith('-') || arg === '-') {
      words.push(arg)
      continue
    }
    if (FLAGS_WITH_VALUES.has(arg)) {
      const value = argv[++i]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      if (arg === '-C' || arg === '--repo') repos.push(resolve(cwd, value))
      else flags[arg] = value
      continue
    }
    if (['-h', '--help', '-v', '--version', '--no-open', '--no-terminal'].includes(arg)) {
      flags[arg] = true
      continue
    }
    throw new Error(`unknown option ${arg}; see duck-diff --help`)
  }

  const [command, ...rest] = words
  if (flags['-v'] || flags['--version'] || command === 'version') return { name: 'version' }
  if (flags['-h'] || flags['--help']) return { name: 'help', topic: command ?? null }
  if (command === 'help') return { name: 'help', topic: rest[0] ?? null }

  if (command === 'cache') {
    if (rest[0] !== 'clear' || rest.length > 1) throw new Error('usage: duck-diff cache clear [--repo <path>]')
    return { name: 'cache-clear', repo: repos[0] ?? null }
  }
  if (command === 'update') {
    if (rest.length > 1) throw new Error('usage: duck-diff update [<version>]')
    return { name: 'update', version: rest[0]?.replace(/^v/, '') ?? null }
  }

  const port = flags['-p'] ?? flags['--port']
  const common = {
    repo: repos[0] ?? cwd,
    port: port === undefined ? 0 : wholeNumber('--port', port as string),
    idleTimeoutMs:
      flags['--idle-timeout-ms'] === undefined
        ? 600_000
        : wholeNumber('--idle-timeout-ms', flags['--idle-timeout-ms'] as string),
    terminal: !flags['--no-terminal'],
  }

  if (command === 'serve') {
    if (rest.length) throw new Error('serve takes no arguments; see duck-diff help serve')
    return {
      name: 'serve',
      ...common,
      // Further --repo folders join the repo switcher; the first one is served.
      more: repos.slice(1),
      nvim: typeof flags['--nvim'] === 'string' ? flags['--nvim'] : null,
    }
  }

  const view = VIEWS.find((name) => name === command)
  const path = view ? viewPath(view, rest) : diffPath(parseTarget(command === 'diff' ? rest : words))
  return { name: 'open', ...common, path, browser: !flags['--no-open'] }
}
