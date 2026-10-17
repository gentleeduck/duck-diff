import { describe, expect, it } from 'vitest'
import { clipboardKey } from '../xterm'

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

describe('terminal clipboard keys', () => {
  it('copies with Ctrl+Shift+C or Ctrl+Insert, and with Ctrl+C only while text is selected', () => {
    expect(clipboardKey(key({ key: 'C', ctrlKey: true, shiftKey: true }), false)).toBe('copy')
    expect(clipboardKey(key({ key: 'Insert', ctrlKey: true }), false)).toBe('copy')
    expect(clipboardKey(key({ key: 'c', ctrlKey: true }), true)).toBe('copy')
    // Nothing selected: Ctrl+C is the shell's interrupt.
    expect(clipboardKey(key({ key: 'c', ctrlKey: true }), false)).toBeNull()
  })

  it('pastes with Ctrl+V, Ctrl+Shift+V or Shift+Insert, and leaves every other key to the shell', () => {
    expect(clipboardKey(key({ key: 'v', ctrlKey: true }), false)).toBe('paste')
    expect(clipboardKey(key({ key: 'V', ctrlKey: true, shiftKey: true }), false)).toBe('paste')
    expect(clipboardKey(key({ key: 'Insert', shiftKey: true }), false)).toBe('paste')
    for (const other of ['z', 'd', 'r', 'a', 'e', 'l', 'w'])
      expect(clipboardKey(key({ key: other, ctrlKey: true }), false)).toBeNull()
  })
})
