import type { LspLocation } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import type { AppContextValue } from '../../app/AppProvider'
import { createStore } from '../../lib/store'
import { fakeApi } from '../../test/fake-api'
import { goToDefinition } from '../navigate'
import type { SymbolTarget } from '../symbol-at'

const location = (path: string, line: number): LspLocation => ({
  path,
  line,
  column: 1,
  endLine: line,
  endColumn: 2,
  text: '',
})

function app(locations: LspLocation[]) {
  const stores = {
    api: fakeApi({
      lsp: {
        definition: async () => ({ source: 'server', server: 'typescript', locations }),
        references: async () => ({ source: null, server: null, locations: [] }),
        hover: async () => ({ source: null, server: null, contents: null }),
      },
    }),
    symbol: createStore<SymbolTarget | null>(null),
    fileSelection: createStore<string | null>(null),
    fileLine: createStore<number | null>(null),
    fileAt: createStore<string | null>(null),
  }
  return stores as typeof stores & AppContextValue
}

const target: SymbolTarget = { name: 'load', ref: 'abc', at: { path: 'src/use.ts', line: 2, column: 18 } }

describe('goToDefinition', () => {
  it('opens the only definition, at the revision only when it is the same file', async () => {
    const one = app([location('src/b.ts', 4)])
    let opened = 0
    await goToDefinition(one, target, () => opened++)
    expect([one.fileSelection.get(), one.fileLine.get(), one.fileAt.get(), opened]).toEqual(['src/b.ts', 4, null, 1])
    const same = app([location('src/use.ts', 1)])
    await goToDefinition(same, target, () => {})
    expect(same.fileAt.get()).toBe('abc')
  })

  it('opens the symbol panel when there are none or several to choose from', async () => {
    for (const locations of [[], [location('a.ts', 1), location('b.ts', 1)]]) {
      const several = app(locations)
      await goToDefinition(several, target, () => {
        throw new Error('should not open a file')
      })
      expect(several.symbol.get()).toEqual(target)
      expect(several.fileSelection.get()).toBeNull()
    }
  })
})
