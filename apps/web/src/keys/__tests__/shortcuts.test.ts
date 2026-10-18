import { describe, expect, it } from 'vitest'
import { SHORTCUTS, shortcutFor } from '../shortcuts'

const press = (key: string, mods: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = {}) =>
  new KeyboardEvent('keydown', { key, ...mods })

describe('shortcuts', () => {
  it('answers a key with the one shortcut bound to it', () => {
    expect(shortcutFor(press('j'))?.id).toBe('next-hunk')
    expect(shortcutFor(press('J', { shiftKey: true }))?.id).toBe('next-file')
    expect(shortcutFor(press('?', { shiftKey: true }))?.id).toBe('shortcuts')
    expect(shortcutFor(press('p', { ctrlKey: true }))?.id).toBe('palette')
    expect(shortcutFor(press('k', { ctrlKey: true }))?.id).toBe('focus-up')
    expect(shortcutFor(press('ArrowLeft', { altKey: true }))?.id).toBe('back')
    expect(shortcutFor(press('Escape'))?.id).toBe('escape')
  })

  it('wants the modifiers exactly', () => {
    expect(shortcutFor(press('j', { ctrlKey: true }))?.id).toBe('focus-down')
    expect(shortcutFor(press('s', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(press('ArrowLeft'))).toBeNull()
  })

  it('binds no key twice', () => {
    const seen = new Map<string, string>()
    for (const shortcut of SHORTCUTS) {
      for (const key of new Set(shortcut.keys.map((key) => key.replace('mod+', 'ctrl+')))) {
        expect(seen.get(key), `${key} is ${seen.get(key)} and ${shortcut.id}`).toBeUndefined()
        seen.set(key, shortcut.id)
      }
    }
  })
})
