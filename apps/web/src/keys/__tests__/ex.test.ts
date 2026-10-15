import { describe, expect, it } from 'vitest'
import { parseEx } from '../ex'

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
