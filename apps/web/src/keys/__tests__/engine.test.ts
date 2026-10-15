import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Binding, createDispatcher, eventKey, parseKeys } from '../engine'

const ev = (key: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey', boolean>> = {}) => ({
  key,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
})

describe('parseKeys', () => {
  it('reads vim notation, with Space as the leader', () => {
    expect(parseKeys('<leader>sf')).toEqual(['space', 's', 'f'])
    expect(parseKeys(']c')).toEqual([']', 'c'])
    expect(parseKeys('gg')).toEqual(['g', 'g'])
    expect(parseKeys('J')).toEqual(['J'])
    expect(parseKeys('<C-d>')).toEqual(['ctrl+d'])
    expect(parseKeys('<C-S-p>')).toEqual(['ctrl+shift+p'])
    expect(parseKeys('<Esc><Esc>')).toEqual(['esc', 'esc'])
    expect(parseKeys('<C-`>')).toEqual(['ctrl+`'])
    expect(parseKeys('<leader><leader>')).toEqual(['space', 'space'])
    expect(parseKeys('<lt>')).toEqual(['<'])
    expect(parseKeys('<C-->')).toEqual(['ctrl+-'])
    expect(() => parseKeys('<Nope>')).toThrow(/Nope/)
  })
})

describe('eventKey', () => {
  it('names a key the way the notation does', () => {
    expect(eventKey(ev('j'))).toBe('j')
    expect(eventKey(ev('J', { shiftKey: true }))).toBe('J')
    expect(eventKey(ev('?', { shiftKey: true }))).toBe('?')
    expect(eventKey(ev(' '))).toBe('space')
    expect(eventKey(ev('d', { ctrlKey: true }))).toBe('ctrl+d')
    expect(eventKey(ev('P', { ctrlKey: true, shiftKey: true }))).toBe('ctrl+shift+p')
    expect(eventKey(ev('Escape'))).toBe('esc')
    expect(eventKey(ev('ArrowLeft', { altKey: true }))).toBe('alt+left')
    expect(eventKey(ev('Shift', { shiftKey: true }))).toBeNull()
    expect(eventKey(ev('+', { ctrlKey: true, shiftKey: true }))).toBe('ctrl++')
  })
})

describe('dispatcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = (extra: Binding[] = []) => {
    const ran: string[] = []
    const dropped: string[][] = []
    const bindings: Binding[] = [
      { keys: parseKeys('j'), command: 'down', modes: ['normal'] },
      { keys: parseKeys('<leader>p'), command: 'push', modes: ['normal'] },
      { keys: parseKeys('<leader>pv'), command: 'tree', modes: ['normal'] },
      { keys: parseKeys('<leader>sf'), command: 'files', modes: ['normal'] },
      { keys: parseKeys('gg'), command: 'top', modes: ['normal'] },
      { keys: parseKeys('<Esc><Esc>'), command: 'leave', modes: ['terminal'] },
      ...extra,
    ]
    const keys = createDispatcher(bindings, {
      timeoutMs: 500,
      run: (command) => ran.push(command),
      drop: (keys) => dropped.push(keys),
    })
    return { keys, ran, dropped }
  }

  it('runs a single key at once', () => {
    const { keys, ran } = setup()
    expect(keys.feed('j', 'normal')).toBe('run')
    expect(ran).toEqual(['down'])
  })

  it('waits on a prefix and runs the chord', () => {
    const { keys, ran } = setup()
    expect(keys.feed('space', 'normal')).toBe('pending')
    expect(keys.pending()).toEqual(['space'])
    expect(keys.feed('s', 'normal')).toBe('pending')
    expect(keys.feed('f', 'normal')).toBe('run')
    expect(ran).toEqual(['files'])
    expect(keys.pending()).toEqual([])
  })

  it('runs the shorter of two chords after the timeout, the longer one when typed', () => {
    const { keys, ran } = setup()
    keys.feed('space', 'normal')
    expect(keys.feed('p', 'normal')).toBe('pending')
    vi.advanceTimersByTime(500)
    expect(ran).toEqual(['push'])
    keys.feed('space', 'normal')
    keys.feed('p', 'normal')
    keys.feed('v', 'normal')
    expect(ran).toEqual(['push', 'tree'])
  })

  it('waits on a plain prefix until the next key', () => {
    const { keys, ran } = setup()
    keys.feed('space', 'normal')
    vi.advanceTimersByTime(5000)
    expect(keys.pending()).toEqual(['space'])
    keys.feed('s', 'normal')
    keys.feed('f', 'normal')
    expect(ran).toEqual(['files'])
  })

  it('drops a dead prefix and tries the new key on its own', () => {
    const { keys, ran } = setup()
    keys.feed('g', 'normal')
    expect(keys.feed('j', 'normal')).toBe('run')
    expect(ran).toEqual(['down'])
  })

  it('hands keys held for a chord back when the chord does not come', () => {
    const { keys, ran, dropped } = setup()
    expect(keys.feed('esc', 'terminal')).toBe('pending')
    expect(keys.feed('x', 'terminal')).toBe('none')
    expect(dropped).toEqual([['esc']])
    keys.feed('esc', 'terminal')
    vi.advanceTimersByTime(500)
    expect(dropped).toEqual([['esc'], ['esc']])
    keys.feed('esc', 'terminal')
    expect(keys.feed('esc', 'terminal')).toBe('run')
    expect(ran).toEqual(['leave'])
  })

  it('keeps modes apart and skips bindings whose condition is false', () => {
    let inPanel = false
    const { keys, ran } = setup([
      { keys: parseKeys('<C-k>'), command: 'up', modes: ['normal'], when: () => inPanel },
      { keys: parseKeys('<C-k>'), command: 'palette', modes: ['normal', 'insert'] },
    ])
    expect(keys.feed('j', 'insert')).toBe('none')
    keys.feed('ctrl+k', 'normal')
    inPanel = true
    keys.feed('ctrl+k', 'normal')
    keys.feed('ctrl+k', 'insert')
    expect(ran).toEqual(['palette', 'up', 'palette'])
  })

  it('lists what can follow a pending prefix, for which-key', () => {
    const { keys } = setup()
    keys.feed('space', 'normal')
    expect(keys.next('normal')).toEqual([
      { key: 'p', command: 'push', more: true },
      { key: 's', command: null, more: true },
    ])
  })
})
