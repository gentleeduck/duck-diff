import { accessSync, constants, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, extname, isAbsolute, join } from 'node:path'

export interface ServerSpec {
  // One process per name serves every language listed for it.
  name: string
  commands: string[][]
  languages: Record<string, string>
}

export const SERVERS: ServerSpec[] = [
  {
    name: 'typescript',
    // TypeScript 7 serves LSP itself; an older tsc refuses --lsp and gives way to a wrapper around tsserver.
    commands: [
      ['tsgo', '--lsp', '--stdio'],
      ['tsc', '--lsp', '--stdio'],
      ['typescript-language-server', '--stdio'],
      ['vtsls', '--stdio'],
    ],
    languages: {
      '.ts': 'typescript',
      '.mts': 'typescript',
      '.cts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.jsx': 'javascriptreact',
    },
  },
  { name: 'go', commands: [['gopls']], languages: { '.go': 'go' } },
  { name: 'rust', commands: [['rust-analyzer']], languages: { '.rs': 'rust' } },
  {
    name: 'python',
    commands: [
      ['basedpyright-langserver', '--stdio'],
      ['pyright-langserver', '--stdio'],
    ],
    languages: { '.py': 'python', '.pyi': 'python' },
  },
  { name: 'lua', commands: [['lua-language-server']], languages: { '.lua': 'lua' } },
  {
    name: 'c',
    commands: [['clangd']],
    languages: { '.c': 'c', '.h': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.hpp': 'cpp', '.cxx': 'cpp' },
  },
]

export function specFor(path: string, specs: ServerSpec[] = SERVERS): { spec: ServerSpec; languageId: string } | null {
  const extension = extname(path).toLowerCase()
  for (const spec of specs) {
    const languageId = spec.languages[extension]
    if (languageId) return { spec, languageId }
  }
  return null
}

// Servers installed by Neovim's Mason count too, since that is where most editor setups keep them.
function searchDirs(env: NodeJS.ProcessEnv): string[] {
  const dirs = (env.PATH ?? '').split(delimiter).filter(Boolean)
  const data = env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
  return [...dirs, join(data, 'nvim', 'mason', 'bin')]
}

// Every install of every command, in order: one that fails to start (a wrapper missing its TypeScript, say)
// gives way to the next.
export function candidates(spec: ServerSpec, env: NodeJS.ProcessEnv = process.env): string[][] {
  const seen = new Set<string>()
  const out: string[][] = []
  for (const [program, ...args] of spec.commands) {
    if (!program) continue
    for (const dir of isAbsolute(program) ? [''] : searchDirs(env)) {
      const candidate = dir ? join(dir, program) : program
      try {
        accessSync(candidate, constants.X_OK)
        const real = realpathSync(candidate)
        if (seen.has(real)) continue
        seen.add(real)
        out.push([candidate, ...args])
      } catch {}
    }
  }
  return out
}
