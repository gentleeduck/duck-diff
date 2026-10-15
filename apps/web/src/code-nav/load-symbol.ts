import type { LspLocation, SymbolHit, SymbolResult } from '@duck-diff/protocol'
import type { Api } from '../lib/api'
import type { SymbolTarget } from './symbol-at'

// Where the list came from: a language server (Neovim's or one started for the page) or a text search.
export interface Found extends SymbolResult {
  source: 'nvim' | 'server' | 'text'
  server: string | null
}

const IMPORT_LINE = /^\s*(import\b|export\s+(\*|\{[^}]*\})\s+from\b|from\s+\S+\s+import\b|use\s|#include)/

function toHits(locations: LspLocation[], kind: (location: LspLocation) => SymbolHit['kind']): SymbolHit[] {
  return locations.map((location) => ({
    path: location.path,
    line: location.line,
    column: location.column,
    text: location.text,
    kind: kind(location),
  }))
}

// Exact lists from a language server when one handles the file, otherwise every text match of the name.
export async function loadSymbol(api: Api, target: SymbolTarget): Promise<Found> {
  if (target.at) {
    const query = { ...target.at, ...(target.ref ? { ref: target.ref } : {}) }
    const [definition, references] = await Promise.all([
      api.lsp.definition(query).catch(() => null),
      api.lsp.references(query).catch(() => null),
    ])
    const precise = [definition, references].find((answer) => answer?.source && answer.locations.length)
    if (precise?.source) {
      const defined = new Set((definition?.locations ?? []).map((entry) => `${entry.path}:${entry.line}`))
      const hits = [
        ...toHits(definition?.locations ?? [], () => 'definition'),
        ...toHits(
          (references?.locations ?? []).filter((entry) => !defined.has(`${entry.path}:${entry.line}`)),
          (entry) => (IMPORT_LINE.test(entry.text) ? 'import' : 'reference'),
        ),
      ]
      return { name: target.name, hits, truncated: false, source: precise.source, server: precise.server }
    }
  }
  return { ...(await api.symbols(target.name, target.ref)), source: 'text', server: null }
}

export function sourceLabel(found: Found): string {
  if (found.source === 'nvim') return `Neovim ${found.server ?? 'language server'}`
  if (found.source === 'server') return `${found.server ?? 'language'} server`
  return 'Text match'
}
