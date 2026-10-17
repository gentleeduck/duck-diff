import { describe, expect, it } from 'vitest'
import { isBrowserShortcut } from '../browser-keys'

const key = (name: string, mods: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {}) => ({
  key: name,
  ctrlKey: Boolean(mods.ctrl),
  metaKey: Boolean(mods.meta),
  altKey: Boolean(mods.alt),
})

describe('browser shortcuts', () => {
  it("keeps the browser's own keys out of the app, all but reload", () => {
    for (const name of ['p', 's', 'f', 'h', 'j', 'd', 'u', 'o', 'g', 'e', 'l', 'I'])
      expect(isBrowserShortcut(key(name, { ctrl: true }), false)).toBe(true)
    expect(isBrowserShortcut(key('F12'), false)).toBe(true)
    expect(isBrowserShortcut(key('F3'), false)).toBe(true)
    expect(isBrowserShortcut(key('ArrowLeft', { alt: true }), false)).toBe(true)
    expect(isBrowserShortcut(key('r', { ctrl: true }), false)).toBe(false)
    expect(isBrowserShortcut(key('R', { meta: true }), false)).toBe(false)
    expect(isBrowserShortcut(key('F5'), false)).toBe(false)
  })

  it('leaves a text box its own editing keys, and plain typing alone', () => {
    for (const name of ['a', 'c', 'v', 'x', 'z', 'y']) {
      expect(isBrowserShortcut(key(name, { ctrl: true }), true)).toBe(false)
      expect(isBrowserShortcut(key(name, { ctrl: true }), false)).toBe(true)
    }
    expect(isBrowserShortcut(key('a'), true)).toBe(false)
    expect(isBrowserShortcut(key('Tab'), false)).toBe(false)
  })
})
