import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LspHover, LspLocations, LspQuery } from '@duck-diff/protocol'
import { evalNvim, luaCall, type NvimEval } from '../nvim'
import { type Encoding, hoverText, resolveLocations, toLocations } from './locations'
import { createLspPool, type LspPool, type LspPoolOptions } from './pool'

export interface NavigatorOptions extends LspPoolOptions {
  nvim?: string | null
  evalNvim?: NvimEval
  pool?: LspPool
}

export interface Navigator {
  definition(query: LspQuery): Promise<LspLocations>
  references(query: LspQuery): Promise<LspLocations>
  hover(query: LspQuery): Promise<LspHover>
  stop(): Promise<void>
}

type Kind = 'definition' | 'references' | 'hover'
type NvimResult = { server: string; encoding: Encoding; result: unknown }

const IMPORT_LINE = /^\s*(import\b|export\s+(\*|\{[^}]*\})\s+from\b)/

// Neovim's own clients first (same answers as the editor, no second server), then servers started here.
// A commit's version of a file is not what Neovim has open, so those go straight to the pool.
export function createNavigator(repo: string, options: NavigatorOptions = {}): Navigator {
  const pool = options.pool ?? createLspPool(repo, options)
  const evaluate = options.evalNvim ?? evalNvim

  async function fromNvim(kind: Kind, query: LspQuery): Promise<NvimResult[]> {
    if (!options.nvim || query.ref) return []
    const argument = JSON.stringify({
      file: join(repo, query.path),
      kind,
      line: query.line - 1,
      character: query.column - 1,
    })
    try {
      const out = JSON.parse(await evaluate(options.nvim, luaCall('duck-diff.lsp', 'query', argument)))
      return Array.isArray(out?.results) ? out.results : []
    } catch {
      return []
    }
  }

  const readLines = async (path: string) =>
    (await readFile(join(repo, path), 'utf8').catch(() => null))?.split('\n') ?? null

  async function locations(kind: 'definition' | 'references', query: LspQuery): Promise<LspLocations> {
    const answers = await fromNvim(kind, query)
    const found: LspLocations = { source: 'nvim', server: null, locations: [] }
    for (const answer of answers) {
      const resolved = await resolveLocations(repo, toLocations(answer.result), readLines, answer.encoding)
      if (!resolved.length) continue
      found.server ??= answer.server
      found.locations.push(...resolved)
      // One client's definition is the answer; references from several clients add up.
      if (kind === 'definition') break
    }
    if (found.locations.length) return found
    return kind === 'definition' ? pool.definition(query) : pool.references(query)
  }

  async function definition(query: LspQuery, hops = 1): Promise<LspLocations> {
    const found = await locations('definition', query)
    // tsserver stops at the import that brought a name in; one more hop reaches the declaration.
    const only = found.locations.length === 1 ? found.locations[0] : undefined
    if (!hops || !only || only.path !== query.path || !IMPORT_LINE.test(only.text)) return found
    if (only.line === query.line && only.column === query.column) return found
    const next = await definition({ ...query, line: only.line, column: only.column }, hops - 1)
    return next.locations.length ? next : found
  }

  return {
    definition: (query) => definition(query),
    references: (query) => locations('references', query),
    async hover(query) {
      for (const answer of await fromNvim('hover', query)) {
        const contents = hoverText((answer.result as { contents?: unknown } | null)?.contents)
        if (contents) return { source: 'nvim', server: answer.server, contents }
      }
      return pool.hover(query)
    },
    stop: () => pool.stop(),
  }
}
