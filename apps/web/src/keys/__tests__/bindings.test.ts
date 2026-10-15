import { describe, expect, it } from 'vitest'
import { buildBindings, conflicts } from '../bindings'
import { COMMANDS } from '../commands'

const always = { anywhere: () => true, diff: () => true, panel: () => false, list: () => false }

describe('bindings', () => {
  it('has no two default commands on the same keys in the same mode and place', () => {
    expect(conflicts(COMMANDS, {})).toEqual([])
  })

  it('never binds a plain key while typing or in a terminal', () => {
    const bindings = buildBindings(COMMANDS, {}, always)
    const typed = bindings.filter((binding) => binding.modes.some((mode) => mode !== 'normal'))
    for (const binding of typed) {
      expect(binding.keys[0], binding.command).toMatch(/^(ctrl|alt|meta)\+|^esc$/)
    }
    expect(typed.map((binding) => binding.command)).toContain('palette')
    expect(typed.some((binding) => binding.keys.join(' ') === 'space s g')).toBe(false)
  })

  it('takes a user override in place of the defaults and reports a clash', () => {
    const bindings = buildBindings(COMMANDS, { push: ['<leader>gP'] }, always)
    const push = bindings.filter((binding) => binding.command === 'push').map((binding) => binding.keys.join(' '))
    expect(push).toEqual(['space g P'])
    expect(conflicts(COMMANDS, { push: ['j'] })).toEqual([{ keys: 'j', commands: ['next-hunk', 'push'] }])
  })

  it('puts place-bound keys first so they win where they apply', () => {
    const bindings = buildBindings(COMMANDS, {}, always)
    const ctrlK = bindings.filter((binding) => binding.keys.join(' ') === 'ctrl+k').map((binding) => binding.command)
    expect(ctrlK).toEqual(['focus-up', 'palette'])
  })
})
