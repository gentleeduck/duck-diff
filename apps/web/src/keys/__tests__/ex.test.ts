import { describe, expect, it } from 'vitest'
import { completeEx, EX_COMMANDS, parseEx } from '../ex'

describe('parseEx', () => {
  it('reads the commands the command line knows', () => {
    expect(parseEx('w')).toEqual({ kind: 'write', message: '' })
    expect(parseEx('w fix the parser')).toEqual({ kind: 'write', message: 'fix the parser' })
    expect(parseEx('q')).toEqual({ kind: 'quit' })
    expect(parseEx('Git log --oneline -5')).toEqual({ kind: 'shell', command: 'git log --oneline -5' })
    expect(parseEx('G status')).toEqual({ kind: 'shell', command: 'git status' })
    expect(parseEx('!bun test')).toEqual({ kind: 'shell', command: 'bun test' })
    expect(parseEx('term')).toEqual({ kind: 'terminal' })
    expect(parseEx('e src/app.ts')).toEqual({ kind: 'edit', path: 'src/app.ts' })
    expect(parseEx('set unified')).toEqual({ kind: 'set', option: 'unified' })
    expect(parseEx('map')).toEqual({ kind: 'keymaps' })
    expect(parseEx('help')).toEqual({ kind: 'keymaps' })
    expect(parseEx('  tabnext ')).toEqual({ kind: 'tab', step: 1 })
    expect(parseEx('tabp')).toEqual({ kind: 'tab', step: -1 })
    expect(parseEx('push')).toEqual({ kind: 'unknown', text: 'push' })
    expect(parseEx('')).toEqual({ kind: 'none' })
  })
})

describe('completeEx', () => {
  it('offers the commands that start with what is typed, then their arguments', () => {
    expect(completeEx('').length).toBe(EX_COMMANDS.length)
    expect(completeEx('ta').map((entry) => entry.insert)).toEqual(['tabnext', 'tabprevious'])
    expect(completeEx('G').map((entry) => entry.insert)).toEqual(['Git '])
    expect(completeEx('set ').map((entry) => entry.insert)).toEqual([
      'set split',
      'set unified',
      'set wrap',
      'set nowrap',
    ])
    expect(completeEx('set w').map((entry) => entry.insert)).toEqual(['set wrap'])
    expect(completeEx('!ls')).toEqual([])
  })
})
