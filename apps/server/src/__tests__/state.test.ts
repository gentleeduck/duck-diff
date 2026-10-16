import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStateStore, openingTarget, pageDiff, pageState } from '../state'

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

  it('reports what changed, by its own hand or by another server writing the same file', async () => {
    const here = createStateStore(data, '/a')
    const other = createStateStore(data, '/b')
    await here.update({ kept: '1', dropped: '1' })
    const seen: Record<string, string | null>[] = []
    const stop = here.watch((changes) => seen.push(changes))
    await here.update({ mine: '1' })
    await other.update({ theirs: '2', dropped: null })
    await Bun.sleep(400)
    stop()
    await other.update({ after: '3' })
    await Bun.sleep(200)
    expect(seen).toEqual([{ mine: '1' }, { theirs: '2', dropped: null }])
  })

  it('tells nothing when the file cannot be read, rather than every key gone', async () => {
    const here = createStateStore(data, '/a')
    await here.update({ kept: '1' })
    const seen: Record<string, string | null>[] = []
    const stop = here.watch((changes) => seen.push(changes))
    await Bun.sleep(100)
    await writeFile(join(data, 'duck-diff', 'state.json'), '{"version":1,"values":')
    await Bun.sleep(300)
    await createStateStore(data, '/b').update({ more: '2' })
    await Bun.sleep(300)
    stop()
    // The write after it started from nothing, so kept is gone by then; while unreadable, nothing was told.
    expect(seen).toEqual([{ more: '2', kept: null }])
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

  it('knows which diff a page opens on, from its path or an older ?view= link', () => {
    const at = (href: string) => openingTarget(new URL(href, 'http://page'))
    expect(at('/changes')).toEqual({ kind: 'local' })
    expect(at('/?token=t')).toEqual({ kind: 'local' })
    expect(at(`/changes?target=${encodeURIComponent('{"kind":"staged"}')}`)).toEqual({ kind: 'staged' })
    expect(at('/?view=graph')).toBeNull()
    expect(at('/prs/3')).toBeNull()
    expect(at('/changes?target=%7Bbad')).toBeNull()
  })

  it('puts a held diff into the page, and leaves a missing or huge one out', () => {
    const html = '<head></head>'
    const out = pageDiff(html, 'k', '[{"path":"a"}]', 'diff --git a/a b/a\n</script>')
    const json = /<script id="duck-diff-diff" type="application\/json">(.*?)<\/script>/s.exec(out)?.[1] ?? ''
    expect(JSON.parse(json)).toEqual({ key: 'k', files: [{ path: 'a' }], patch: 'diff --git a/a b/a\n</script>' })
    expect(pageDiff(html, 'k', undefined, 'x')).toBe(html)
    expect(pageDiff(html, 'k', '[]', 'x'.repeat(2_000_000))).toBe(html)
  })

  it("keeps $' and $& in the diff as written", () => {
    const html = '<head></head><body>page</body>'
    const patch = "+echo $'a' $& $` done\n"
    const out = pageDiff(html, 'k', '[]', patch)
    const json = /<script id="duck-diff-diff" type="application\/json">(.*?)<\/script>/s.exec(out)?.[1] ?? ''
    expect(JSON.parse(json).patch).toBe(patch)
    expect(out.endsWith('</head><body>page</body>')).toBe(true)
  })
})
