import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStateStore, pageState } from '../state'

let data: string
beforeEach(async () => {
  data = await mkdtemp(join(tmpdir(), 'duck-state-'))
})
afterEach(() => rm(data, { recursive: true, force: true }))

describe('state store', () => {
  it('keeps values in a JSON file in the data folder, and removes them with null', async () => {
    const store = createStateStore(data, '/repo')
    await store.update({ 'duck-diff:settings': '{"fontSize":15}', 'duck-diff:panel': 'x' })
    await store.update({ 'duck-diff:panel': null })
    const file = JSON.parse(await readFile(join(data, 'duck-diff', 'state.json'), 'utf8'))
    expect(file).toEqual({ version: 1, values: { 'duck-diff:settings': '{"fontSize":15}' } })
    expect(await createStateStore(data, '/repo').values()).toEqual({ 'duck-diff:settings': '{"fontSize":15}' })
  })

  it('merges with what another server wrote meanwhile instead of overwriting it', async () => {
    const first = createStateStore(data, '/a')
    const second = createStateStore(data, '/b')
    await first.values()
    await second.update({ b: '2' })
    await first.update({ a: '1' })
    expect(await createStateStore(data, '/c').values()).toEqual({ a: '1', b: '2' })
  })

  it('keeps the query cache per repo, under its cache folder', async () => {
    const store = createStateStore(data, '/repo')
    expect(await store.queries()).toBeNull()
    await store.setQueries('{"clientState":{}}')
    expect(await store.queries()).toBe('{"clientState":{}}')
    expect(await createStateStore(data, '/other').queries()).toBeNull()
  })

  it('ignores a corrupt file', async () => {
    const store = createStateStore(data, '/repo')
    await store.update({ a: '1' })
    await Bun.write(join(data, 'duck-diff', 'state.json'), '{nope')
    expect(await createStateStore(data, '/repo').values()).toEqual({})
  })

  it('puts the values into the page so it reads them before anything renders', () => {
    const html = '<html><head><title>x</title></head><body></body></html>'
    const out = pageState(html, { a: '</script><b>' })
    expect(out).toContain('<script id="duck-diff-state" type="application/json">')
    expect(out).not.toContain('</script><b>')
    const json = /<script id="duck-diff-state" type="application\/json">(.*?)<\/script>/.exec(out)?.[1] ?? ''
    expect(JSON.parse(json)).toEqual({ a: '</script><b>' })
  })
})
