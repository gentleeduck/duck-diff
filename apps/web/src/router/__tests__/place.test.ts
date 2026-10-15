import { describe, expect, it } from 'vitest'
import { hrefOf, readPlace } from '../place'

const at = (href: string) => {
  const url = new URL(href, 'http://page')
  return readPlace(url.pathname, url.search)
}
const UNSTAGED = encodeURIComponent(JSON.stringify({ kind: 'unstaged' }))

describe('place', () => {
  it('reads each view from its path and its own params', () => {
    expect(at('/changes?path=src%2Fa.ts')).toMatchObject({ view: 'changes', path: 'src/a.ts' })
    expect(at('/prs/12?tab=files&path=b.ts')).toMatchObject({ view: 'prs', number: 12, tab: 'files', path: 'b.ts' })
    expect(at('/issues/4')).toMatchObject({ view: 'issues', number: 4 })
    expect(at('/files?file=README.md&line=3&at=abc')).toMatchObject({ file: 'README.md', line: 3, at: 'abc' })
    expect(at('/graph?commit=abc')).toMatchObject({ view: 'graph', commit: 'abc' })
    expect(at('/merge?path=c.ts')).toMatchObject({ view: 'merge', path: 'c.ts' })
  })

  it('reads the old ?view= links, so the Neovim plugin and saved links keep working', () => {
    expect(at('/?token=t&view=files&file=cat')).toMatchObject({ view: 'files', file: 'cat' })
    expect(at('/?view=prs&number=7&tab=checks')).toMatchObject({ view: 'prs', number: 7, tab: 'checks' })
    expect(at(`/?token=t&target=${UNSTAGED}`)).toMatchObject({ view: 'changes', target: { kind: 'unstaged' } })
    expect(at('/nowhere?view=bogus')).toMatchObject({ view: 'changes' })
  })

  it('writes only what the view owns, keeps the comparison, and drops the token', () => {
    const place = at(`/?token=t&view=files&file=cat&number=3&target=${UNSTAGED}`)
    expect(hrefOf(place)).toBe(`/files?file=cat&target=${UNSTAGED}`)
    expect(hrefOf({ ...place, view: 'prs', number: 3, tab: 'conversation' })).toBe(`/prs/3?target=${UNSTAGED}`)
    expect(hrefOf(at('/changes'))).toBe('/changes')
  })

  it('round-trips every view through its href', () => {
    for (const href of [
      `/changes?path=a.ts&target=${UNSTAGED}`,
      '/prs/3?tab=checks&path=b.ts',
      '/issues/9',
      '/files?file=c&line=4&at=main',
      '/graph?commit=abc',
      '/merge?path=d',
      '/inbox',
    ])
      expect(hrefOf(at(href))).toBe(href)
  })

  it('ignores params that do not parse', () => {
    expect(at('/prs/abc')).toMatchObject({ view: 'prs', number: null })
    expect(at('/files?line=-2')).toMatchObject({ line: null })
    expect(at('/prs/3?tab=nope')).toMatchObject({ tab: 'conversation' })
    expect(at('/changes?target=%7Bbad')).toMatchObject({ target: { kind: 'local' } })
  })
})
