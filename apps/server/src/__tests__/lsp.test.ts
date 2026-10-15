import { afterEach, describe, expect, it } from 'bun:test'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { hoverText, toLocations, toUtf16 } from '../lsp/locations'
import { createLspPool, type LspPool } from '../lsp/pool'
import type { ServerSpec } from '../lsp/servers'

const FAKE: ServerSpec = {
  name: 'fake',
  commands: [['bun', new URL('./fixtures/fake-lsp.ts', import.meta.url).pathname]],
  languages: { '.ts': 'typescript' },
}

let repo: TestRepo
let pool: LspPool
afterEach(async () => {
  await pool?.stop()
  repo?.cleanup()
})

function setup(): string {
  repo = createRepo()
  repo.write('src/a.ts', 'const one = 1\nexport const two = one + 1\n')
  repo.write('src/other.ts', 'export function find() {\n  return 1\n}\n')
  const sha = repo.commit('base')
  repo.write('src/a.ts', 'const uno = 1\nexport const two = uno + 1\n')
  pool = createLspPool(repo.path, { servers: [FAKE] })
  return sha
}

describe('lsp pool', () => {
  it('starts a server on demand and reads a definition with its line text', async () => {
    setup()
    const found = await pool.definition({ path: 'src/a.ts', line: 1, column: 7 })
    expect(found).toEqual({
      source: 'server',
      server: 'fake',
      locations: [{ path: 'src/a.ts', line: 1, column: 7, endLine: 1, endColumn: 10, text: 'const uno = 1' }],
    })
    expect(pool.running()).toEqual(['fake'])
  })

  it('follows location links into other files', async () => {
    setup()
    const found = await pool.definition({ path: 'src/a.ts', line: 2, column: 20 })
    expect(found.locations).toEqual([
      { path: 'src/other.ts', line: 1, column: 17, endLine: 1, endColumn: 21, text: 'export function find() {' },
    ])
  })

  it('drops references outside the repository', async () => {
    setup()
    const found = await pool.references({ path: 'src/a.ts', line: 1, column: 7 })
    expect(found.locations.map((entry) => entry.path)).toEqual(['src/a.ts'])
  })

  it('answers server requests and shows a commit by editing the open document', async () => {
    const sha = setup()
    const now = await pool.hover({ path: 'src/a.ts', line: 1, column: 7 })
    expect(now.contents).toBe('v1 const uno = 1 [null,null]')
    const then = await pool.hover({ path: 'src/a.ts', line: 1, column: 7, ref: sha })
    expect(then).toEqual({ source: 'server', server: 'fake', contents: 'v2 const one = 1 [null,null]' })
  })

  it('reports no source for files no server handles', async () => {
    setup()
    expect(await pool.definition({ path: 'README.md', line: 1, column: 1 })).toEqual({
      source: null,
      server: null,
      locations: [],
    })
    expect(pool.running()).toEqual([])
  })

  it('moves on to the next install when one fails to start', async () => {
    repo = createRepo()
    repo.write('a.ts', 'const a = 1\n')
    const broken: ServerSpec = { ...FAKE, commands: [['false'], ...FAKE.commands] }
    pool = createLspPool(repo.path, { servers: [broken] })
    expect((await pool.definition({ path: 'a.ts', line: 1, column: 7 })).source).toBe('server')
  })

  it('closes idle servers', async () => {
    repo = createRepo()
    repo.write('a.ts', 'const a = 1\n')
    pool = createLspPool(repo.path, { servers: [FAKE], idleMs: 50 })
    await pool.definition({ path: 'a.ts', line: 1, column: 7 })
    expect(pool.running()).toEqual(['fake'])
    await Bun.sleep(200)
    expect(pool.running()).toEqual([])
  })
})

describe('hoverText', () => {
  it('reads markup, marked strings and lists', () => {
    expect(hoverText({ kind: 'markdown', value: '**x**' })).toBe('**x**')
    expect(hoverText({ language: 'ts', value: 'const x: 1' })).toBe('```ts\nconst x: 1\n```')
    expect(hoverText(['a', { language: 'go', value: 'b' }])).toBe('a\n\n---\n\n```go\nb\n```')
    expect(hoverText('')).toBeNull()
    expect(hoverText(null)).toBeNull()
  })
})

describe('toUtf16', () => {
  const line = 'é = "😀" + x'
  it('maps byte and code point offsets to string indexes', () => {
    expect(toUtf16(line, 2, 'utf-8')).toBe(1)
    expect(toUtf16(line, 12, 'utf-8')).toBe(line.indexOf('+'))
    expect(toUtf16(line, 6, 'utf-32')).toBe(line.indexOf('"', 6))
    expect(toUtf16(line, 4, 'utf-16')).toBe(4)
  })
})

describe('toLocations', () => {
  it('reads nothing from an empty Lua table', () => {
    expect(toLocations({})).toEqual([])
    expect(toLocations([])).toEqual([])
  })
})
