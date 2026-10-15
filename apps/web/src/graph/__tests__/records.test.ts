import { describe, expect, it } from 'vitest'
import { createRecordReader, parseRefs } from '../records'

const record = (fields: string[]) => `${fields.join('\x1f')}\x1e`

describe('graph records', () => {
  it('reads records split across chunks', () => {
    const seen: string[] = []
    const reader = createRecordReader((entry) => seen.push(entry.subject), new Set())
    const text = `${record(['a1', 'b2 c3', 'HEAD -> main', 'Duck', 'd@x', '100', 'merge it'])}\n${record(['b2', '', '', 'Duck', 'd@x', '90', 'first'])}`
    reader.push(text.slice(0, 20))
    reader.push(text.slice(20))
    reader.finish()
    expect(seen).toEqual(['merge it', 'first'])
  })

  it('turns decorations into labelled refs', () => {
    const remotes = new Set(['origin/main', 'origin/HEAD'])
    expect(parseRefs('HEAD -> main, origin/main, origin/HEAD, tag: v1.0, feat', remotes)).toEqual([
      { name: 'main', kind: 'branch', current: true },
      { name: 'origin/main', kind: 'remote', current: false },
      { name: 'v1.0', kind: 'tag', current: false },
      { name: 'feat', kind: 'branch', current: false },
    ])
    expect(parseRefs('HEAD', remotes)).toEqual([{ name: 'HEAD', kind: 'head', current: true }])
    expect(parseRefs('', remotes)).toEqual([])
  })
})
