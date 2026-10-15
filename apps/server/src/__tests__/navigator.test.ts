import { afterEach, describe, expect, it } from 'bun:test'
import { pathToFileURL } from 'node:url'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createNavigator, type Navigator } from '../lsp/navigator'
import type { ServerSpec } from '../lsp/servers'
import { luaCall } from '../nvim'

const FAKE: ServerSpec = {
  name: 'fake',
  commands: [['bun', new URL('./fixtures/fake-lsp.ts', import.meta.url).pathname]],
  languages: { '.ts': 'typescript' },
}

let repo: TestRepo
let navigator: Navigator
afterEach(async () => {
  await navigator?.stop()
  repo?.cleanup()
})

const range = (line: number, start: number, end: number) => ({
  start: { line, character: start },
  end: { line, character: end },
})

function setup(answer: (kind: string) => unknown) {
  repo = createRepo()
  repo.write('src/a.ts', "import { é } from './b'\nconst x = é + 1\n")
  repo.write('src/b.ts', 'export const é = 1\n')
  const sha = repo.commit('base')
  const calls: { address: string; expr: string }[] = []
  navigator = createNavigator(repo.path, {
    nvim: '/tmp/nvim.sock',
    servers: [FAKE],
    evalNvim: async (address, expr) => {
      calls.push({ address, expr })
      const argument = JSON.parse(/, '(.*)'\)$/.exec(expr)?.[1]?.replace(/''/g, "'") ?? '{}')
      const result = answer(argument.kind)
      return JSON.stringify({ results: result ? [result] : [] })
    },
  })
  const uri = (path: string) => pathToFileURL(`${repo.path}/${path}`).href
  return { calls, uri, sha }
}

describe('navigator', () => {
  it("asks Neovim first and converts its client's encoding", async () => {
    let uri = (_: string) => ''
    const setupResult = setup((kind) =>
      kind === 'references'
        ? { server: 'ts_ls', encoding: 'utf-8', result: [{ uri: uri('src/a.ts'), range: range(1, 10, 12) }] }
        : null,
    )
    uri = setupResult.uri
    const found = await navigator.references({ path: 'src/a.ts', line: 2, column: 11 })
    expect(found).toEqual({
      source: 'nvim',
      server: 'ts_ls',
      locations: [{ path: 'src/a.ts', line: 2, column: 11, endLine: 2, endColumn: 12, text: 'const x = é + 1' }],
    })
    expect(setupResult.calls[0]?.address).toBe('/tmp/nvim.sock')
    expect(setupResult.calls[0]?.expr).toContain('"kind":"references","line":1,"character":10')
  })

  it('asks Neovim only about files it already has open with a server, without waiting', async () => {
    const { calls } = setup(() => null)
    await navigator.hover({ path: 'src/a.ts', line: 1, column: 1 })
    expect(calls[0]?.expr).toContain('"attached":true')
  })

  it('answers from its own server once it is warm, without asking Neovim', async () => {
    const { calls } = setup(() => ({ server: 'ts_ls', encoding: 'utf-16', result: { contents: 'nvim' } }))
    await navigator.warm(['src/a.ts', 'README.md'])
    const found = await navigator.hover({ path: 'src/a.ts', line: 1, column: 1 })
    expect(found).toMatchObject({ source: 'server', server: 'fake' })
    expect(calls).toEqual([])
  })

  it('falls back to its own servers when Neovim has no client', async () => {
    setup(() => null)
    const found = await navigator.hover({ path: 'src/a.ts', line: 1, column: 1 })
    expect(found.source).toBe('server')
    expect(found.server).toBe('fake')
  })

  it('reads a commit with its own servers only', async () => {
    const { calls, sha } = setup(() => ({ server: 'ts_ls', encoding: 'utf-16', result: { contents: 'nvim' } }))
    const found = await navigator.hover({ path: 'src/a.ts', line: 1, column: 1, ref: sha })
    expect(found.source).toBe('server')
    expect(calls).toEqual([])
  })

  it('goes past an import to the declaration', async () => {
    let uri = (_: string) => ''
    let asked = 0
    const setupResult = setup((kind) => {
      if (kind !== 'definition') return null
      asked++
      return asked === 1
        ? { server: 'ts_ls', encoding: 'utf-16', result: { uri: uri('src/a.ts'), range: range(0, 9, 10) } }
        : { server: 'ts_ls', encoding: 'utf-16', result: { uri: uri('src/b.ts'), range: range(0, 13, 14) } }
    })
    uri = setupResult.uri
    const found = await navigator.definition({ path: 'src/a.ts', line: 2, column: 11 })
    expect(found.locations).toEqual([
      { path: 'src/b.ts', line: 1, column: 14, endLine: 1, endColumn: 15, text: 'export const é = 1' },
    ])
    expect(setupResult.calls[1]?.expr).toContain('"line":0,"character":9')
  })
})

describe('luaCall', () => {
  it('doubles single quotes in the argument', () => {
    expect(luaCall('m', 'f', `{"a":"it's"}`)).toBe(`luaeval('require("m").f(_A)', '{"a":"it''s"}')`)
  })
})

describe('lsp routes', () => {
  it('answers definition, references and hover, and rejects bad positions', async () => {
    const { createServer } = await import('../server')
    const { testPort } = await import('./helpers')
    repo = createRepo()
    repo.write('src/a.ts', 'const one = 1\n')
    const server = await createServer({ repo: repo.path, port: testPort(), watch: false, lsp: { servers: [FAKE] } })
    const get = (path: string) =>
      fetch(`http://127.0.0.1:${server.port}${path}`, { headers: { 'x-duck-diff-token': server.token } })
    try {
      const definition = await (await get('/api/lsp/definition?path=src/a.ts&line=1&column=7')).json()
      expect(definition.locations[0]).toMatchObject({ path: 'src/a.ts', line: 1, column: 7 })
      expect((await (await get('/api/lsp/references?path=src/a.ts&line=1&column=7')).json()).server).toBe('fake')
      expect((await (await get('/api/lsp/hover?path=src/a.ts&line=1&column=7')).json()).contents).toContain('const one')
      expect((await get('/api/lsp/hover?path=src/a.ts&line=0&column=7')).status).toBe(400)
      expect((await get('/api/lsp/hover?path=../x.ts&line=1&column=1')).status).toBe(400)
      expect((await get('/api/lsp/rename?path=src/a.ts&line=1&column=1')).status).toBe(404)
      const warm = await fetch(`http://127.0.0.1:${server.port}/api/lsp/warm`, {
        method: 'POST',
        headers: { 'x-duck-diff-token': server.token, 'content-type': 'application/json' },
        body: JSON.stringify({ paths: ['src/a.ts'] }),
      })
      expect(warm.status).toBe(204)
    } finally {
      await server.stop()
    }
  })
})
