import { describe, expect, it } from 'vitest'
import { type Position, resolveKey, step } from '../keymap'

function key(init: Partial<KeyboardEvent> & { key: string }, tag = 'BODY') {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: { tagName: tag, isContentEditable: false },
    ...init,
  }
}

describe('resolveKey', () => {
  it('maps the single-key shortcuts', () => {
    expect(resolveKey(key({ key: 'j' }))).toBe('next-hunk')
    expect(resolveKey(key({ key: 'k' }))).toBe('prev-hunk')
    expect(resolveKey(key({ key: 'J', shiftKey: true }))).toBe('next-file')
    expect(resolveKey(key({ key: 'K', shiftKey: true }))).toBe('prev-file')
    expect(resolveKey(key({ key: 't' }))).toBe('toggle-layout')
    expect(resolveKey(key({ key: '/' }))).toBe('focus-filter')
    expect(resolveKey(key({ key: '?', shiftKey: true }))).toBe('help')
    expect(resolveKey(key({ key: 'k', ctrlKey: true }))).toBe('palette')
    expect(resolveKey(key({ key: 'k', metaKey: true }))).toBe('palette')
    expect(resolveKey(key({ key: 's' }))).toBe('stage')
    expect(resolveKey(key({ key: 'u' }))).toBe('unstage')
    expect(resolveKey(key({ key: 'x' }))).toBe('discard')
    expect(resolveKey(key({ key: 'c' }))).toBe('comment')
    expect(resolveKey(key({ key: 'v' }))).toBe('viewed')
    expect(resolveKey(key({ key: 'o' }))).toBe('open')
  })

  it('ignores keys while typing, except the palette shortcut', () => {
    expect(resolveKey(key({ key: 'j' }, 'INPUT'))).toBeNull()
    expect(resolveKey(key({ key: 'j' }, 'TEXTAREA'))).toBeNull()
    expect(resolveKey(key({ key: 'k', ctrlKey: true }, 'INPUT'))).toBe('palette')
    expect(resolveKey(key({ key: 'z' }))).toBeNull()
  })
})

const ITEMS = [
  { id: 'diff:a', hunks: [{ additionStart: 3 }, { additionStart: 40 }] },
  { id: 'diff:b', hunks: [{ additionStart: 1 }] },
  { id: 'diff:c', hunks: [] },
]

describe('step', () => {
  const start: Position = { item: 0, hunk: 0 }
  it('moves through hunks across files and stops at the ends', () => {
    expect(step(ITEMS, start, 'next-hunk')).toEqual({ item: 0, hunk: 1 })
    expect(step(ITEMS, { item: 0, hunk: 1 }, 'next-hunk')).toEqual({ item: 1, hunk: 0 })
    expect(step(ITEMS, { item: 1, hunk: 0 }, 'next-hunk')).toEqual({ item: 1, hunk: 0 })
    expect(step(ITEMS, { item: 1, hunk: 0 }, 'prev-hunk')).toEqual({ item: 0, hunk: 1 })
    expect(step(ITEMS, start, 'prev-hunk')).toEqual(start)
  })

  it('moves by file and lands on its first hunk', () => {
    expect(step(ITEMS, { item: 0, hunk: 1 }, 'next-file')).toEqual({ item: 1, hunk: 0 })
    expect(step(ITEMS, { item: 1, hunk: 0 }, 'next-file')).toEqual({ item: 2, hunk: 0 })
    expect(step(ITEMS, { item: 2, hunk: 0 }, 'next-file')).toEqual({ item: 2, hunk: 0 })
    expect(step(ITEMS, { item: 1, hunk: 0 }, 'prev-file')).toEqual({ item: 0, hunk: 0 })
  })
})
