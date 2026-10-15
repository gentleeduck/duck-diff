import type { LspLocation } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { fakeApi } from '../../test/fake-api'
import { loadSymbol, sourceLabel } from '../load-symbol'

const at = (path: string, line: number, text: string): LspLocation => ({
  path,
  line,
  column: 1,
  endLine: line,
  endColumn: 2,
  text,
})

describe('loadSymbol', () => {
  it('lists a language server answer, without repeating the definition among the uses', async () => {
    const asked: unknown[] = []
    const api = fakeApi({
      lsp: {
        definition: async (query) => {
          asked.push(query)
          return { source: 'server', server: 'typescript', locations: [at('src/b.ts', 1, 'export function load() {')] }
        },
        references: async () => ({
          source: 'server',
          server: 'typescript',
          locations: [
            at('src/b.ts', 1, 'export function load() {'),
            at('src/use.ts', 1, "import { load } from './b'"),
            at('src/use.ts', 2, 'export const x = load()'),
          ],
        }),
        hover: async () => ({ source: null, server: null, contents: null }),
      },
      symbols: async () => {
        throw new Error('should not search text')
      },
    })
    const found = await loadSymbol(api, { name: 'load', ref: 'abc', at: { path: 'src/use.ts', line: 2, column: 18 } })
    expect(asked).toEqual([{ path: 'src/use.ts', line: 2, column: 18, ref: 'abc' }])
    expect(found.source).toBe('server')
    expect(found.hits.map((hit) => `${hit.kind} ${hit.path}:${hit.line}`)).toEqual([
      'definition src/b.ts:1',
      'import src/use.ts:1',
      'reference src/use.ts:2',
    ])
    expect(sourceLabel(found)).toBe('typescript server')
  })

  it('falls back to text matches when no server handles the file or the click has no position', async () => {
    const api = fakeApi({
      symbols: async (name) => ({
        name,
        truncated: false,
        hits: [{ path: 'a.md', line: 3, column: 1, text: name, kind: 'reference' }],
      }),
    })
    const withPosition = await loadSymbol(api, { name: 'load', ref: null, at: { path: 'a.md', line: 1, column: 1 } })
    expect(withPosition.source).toBe('text')
    expect(withPosition.hits).toHaveLength(1)
    expect(sourceLabel(withPosition)).toBe('Text match')
    expect((await loadSymbol(api, { name: 'load', ref: null })).source).toBe('text')
  })

  it('names Neovim when its client answered', () => {
    expect(sourceLabel({ name: 'x', hits: [], truncated: false, source: 'nvim', server: 'ts_ls' })).toBe('Neovim ts_ls')
  })
})
