import { describe, expect, it } from 'vitest'
import { readView, writeView } from '../view-url'

describe('view in the url', () => {
  it('reads the view and falls back to changes', () => {
    expect(readView('?view=graph')).toBe('graph')
    expect(readView('?view=nope')).toBe('changes')
    expect(readView('')).toBe('changes')
  })

  it('writes the view and keeps the other params', () => {
    expect(writeView('files', '?token=t&target=x')).toBe('?token=t&target=x&view=files')
    expect(writeView('changes', '?token=t&view=graph')).toBe('?token=t')
  })
})
