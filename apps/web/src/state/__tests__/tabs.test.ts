import { describe, expect, it } from 'vitest'
import { createTabs, ROOT } from '../tabs'

const commit = (sha: string) => ({ kind: 'commit' as const, sha })
const kinds = (tabs: ReturnType<typeof createTabs>) =>
  tabs.get().tabs.map((tab) => (tab.target.kind === 'commit' ? tab.target.sha : tab.target.kind))

describe('diff tabs', () => {
  it('keeps the working tree in the root tab and opens anything else in its own', () => {
    const tabs = createTabs({ kind: 'local' })
    tabs.open({ kind: 'staged' })
    expect(kinds(tabs)).toEqual(['staged'])
    tabs.open(commit('a'))
    tabs.open(commit('b'))
    expect(kinds(tabs)).toEqual(['staged', 'a', 'b'])
    // Opening one already open focuses it instead of adding another.
    const again = tabs.open(commit('a'))
    expect(kinds(tabs)).toEqual(['staged', 'a', 'b'])
    expect(tabs.get().active).toBe(again.id)
    tabs.open({ kind: 'unstaged' })
    expect(tabs.get().active).toBe(ROOT)
  })

  it('starts on a commit tab when the page opens on one', () => {
    const tabs = createTabs(commit('a'))
    expect(kinds(tabs)).toEqual(['local', 'a'])
    expect(tabs.get().active).not.toBe(ROOT)
  })

  it('closes any tab but the root, moving to the neighbour when the active one closes', () => {
    const tabs = createTabs({ kind: 'local' })
    const a = tabs.open(commit('a'))
    const b = tabs.open(commit('b'))
    expect(tabs.close(ROOT)).toBeNull()
    expect(tabs.close(b.id)?.id).toBe(a.id)
    expect(tabs.get().active).toBe(a.id)
    expect(tabs.close(a.id)?.id).toBe(ROOT)
    expect(kinds(tabs)).toEqual(['local'])
  })

  it('reorders tabs, never ahead of the root', () => {
    const tabs = createTabs({ kind: 'local' })
    const a = tabs.open(commit('a'))
    const b = tabs.open(commit('b'))
    tabs.move(b.id, a.id)
    expect(kinds(tabs)).toEqual(['local', 'b', 'a'])
    tabs.move(a.id, ROOT)
    expect(kinds(tabs)).toEqual(['local', 'b', 'a'])
    tabs.move(ROOT, null)
    expect(kinds(tabs)).toEqual(['local', 'b', 'a'])
  })

  it('remembers the file of the active tab, and saves and restores tabs per repository', () => {
    const memory = new Map<string, string>()
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
    }
    const tabs = createTabs({ kind: 'local' })
    tabs.restore('/repo', storage)
    tabs.open(commit('a'))
    tabs.rememberPath('src/x.ts')
    expect(tabs.get().tabs[1]?.path).toBe('src/x.ts')

    const later = createTabs(commit('b'))
    later.restore('/repo', storage)
    expect(kinds(later)).toEqual(['local', 'a', 'b'])
    expect(later.get().tabs[1]?.path).toBe('src/x.ts')
    expect(later.get().tabs[later.get().tabs.length - 1]?.id).toBe(later.get().active)
    const other = createTabs({ kind: 'local' })
    other.restore('/other', storage)
    expect(kinds(other)).toEqual(['local'])
  })
})

describe('editing a comparison in its tab', () => {
  it('changes the open tab when only the mode or a pull request base changes, instead of opening another', () => {
    const tabs = createTabs({ kind: 'local' })
    const pr = { kind: 'range' as const, from: 'origin/main', to: 'refs/duck-diff/pr/269', mode: 'merge-base' as const }
    const opened = tabs.open(pr)
    tabs.open({ ...pr, mode: 'two-dot' })
    tabs.open({ ...pr, from: 'origin/feat/basket-page' })
    expect(tabs.get().tabs).toHaveLength(2)
    expect(tabs.get().active).toBe(opened.id)
    expect(tabs.get().tabs[1]?.target).toEqual({ ...pr, from: 'origin/feat/basket-page' })
    // Another pull request, or another range altogether, still gets its own tab.
    tabs.open({ ...pr, to: 'refs/duck-diff/pr/270' })
    expect(tabs.get().tabs).toHaveLength(3)
  })
})

describe('restoring tabs of one comparison', () => {
  it('brings back one tab for a pull request saved twice, once per mode', () => {
    const pr = { kind: 'range' as const, from: 'origin/main', to: 'refs/duck-diff/pr/269', mode: 'merge-base' as const }
    const saved = JSON.stringify([
      { target: pr, path: null },
      { target: { ...pr, mode: 'two-dot' }, path: null },
    ])
    const storage = { getItem: () => saved, setItem: () => {} }
    const tabs = createTabs({ kind: 'local' })
    tabs.restore('/repo', storage)
    expect(tabs.get().tabs.map((tab) => tab.target.kind)).toEqual(['local', 'range'])
  })
})
