import { describe, expect, it } from 'vitest'
import { createTerminalTabs } from '../tabs'

describe('terminal tabs', () => {
  it('numbers new terminals, learns their server id and drops them when the shell exits', () => {
    const tabs = createTerminalTabs({ terminals: async () => [], closeTerminal: async () => {} })
    const one = tabs.add()
    const two = tabs.add()
    expect(tabs.get().tabs.map((tab) => tab.title)).toEqual(['Terminal 1', 'Terminal 2'])
    tabs.setId(one.key, 'term-a')
    tabs.rename(one.key, 'vim')
    tabs.remove(two.key)
    expect(tabs.get().tabs).toEqual([{ key: one.key, id: 'term-a', name: 'Terminal 1', title: 'vim' }])
  })

  it('brings back the terminals still running on the server after a reload', async () => {
    const tabs = createTerminalTabs({
      terminals: async () => [{ id: 'term-x', title: 'zsh', cwd: '/r' }],
      closeTerminal: async () => {},
    })
    await tabs.load()
    expect(tabs.get().tabs).toEqual([{ key: 'term-x', id: 'term-x', name: 'Terminal 1', title: 'Terminal 1' }])
    expect(tabs.add().title).toBe('Terminal 2')
  })

  it('keeps their order, keys, names and titles across a reload', async () => {
    const api = (ids: string[]) => ({
      terminals: async () => ids.map((id) => ({ id, title: 'zsh', cwd: '/r' })),
      closeTerminal: async () => {},
    })
    const before = createTerminalTabs(api([]))
    await before.load()
    const [one, two, three] = [before.add(), before.add(), before.add()]
    before.setId(one.key, 'a')
    before.setId(two.key, 'b')
    before.setId(three.key, 'c')
    before.rename(three.key, 'vim')
    before.remove(one.key)

    const after = createTerminalTabs(api(['c', 'b']))
    await after.load()
    expect(after.get().tabs).toEqual([
      { key: two.key, id: 'b', name: 'Terminal 2', title: 'Terminal 2' },
      { key: three.key, id: 'c', name: 'Terminal 3', title: 'vim' },
    ])
    expect(after.add().name).toBe('Terminal 4')
  })
})

describe('running a command in a terminal', () => {
  it('types into the newest terminal, opening one when there is none', () => {
    const tabs = createTerminalTabs({ terminals: async () => [], closeTerminal: async () => {} })
    const first = tabs.run('git status')
    expect(tabs.get().tabs.map((tab) => tab.key)).toEqual([first])
    expect(tabs.take(first)).toBe('git status\r')
    expect(tabs.take(first)).toBe('')
    const again = tabs.run('ls')
    expect(again).toBe(first)
    expect(tabs.take(first)).toBe('ls\r')
  })
})
