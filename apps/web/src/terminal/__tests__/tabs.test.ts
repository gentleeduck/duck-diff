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
})
