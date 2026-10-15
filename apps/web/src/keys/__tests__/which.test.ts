import { describe, expect, it } from 'vitest'
import { buildBindings } from '../bindings'
import { COMMANDS } from '../commands'
import { continuations, showKeys } from '../which'

const contexts = { anywhere: () => true, diff: () => true, panel: () => false }

describe('which-key', () => {
  it('lists what can follow the leader, with groups named', () => {
    const next = continuations(buildBindings(COMMANDS, {}, contexts), ['space'], 'normal')
    expect(next.find((entry) => entry.key === 's')).toEqual({ key: 's', label: 'search', group: true })
    expect(next.find((entry) => entry.key === 'y')).toEqual({ key: 'y', label: 'Copy the file path', group: false })
    expect(next.find((entry) => entry.key === 'p')).toEqual({ key: 'p', label: 'Push', group: true })
  })

  it('writes keys back in vim notation', () => {
    expect(showKeys(['space', 's', 'f'])).toBe('<leader>sf')
    expect(showKeys(['ctrl+d'])).toBe('<C-d>')
    expect(showKeys(['esc', 'esc'])).toBe('<Esc><Esc>')
    expect(showKeys(['alt+left'])).toBe('<A-Left>')
    expect(showKeys(['G'])).toBe('G')
  })
})
