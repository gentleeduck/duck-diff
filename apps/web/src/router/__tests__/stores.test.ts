import { createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindHistory } from '../../lib/history'
import { createPlaceStores } from '../stores'

const setup = (url: string) => {
  const history = bindHistory(createMemoryHistory({ initialEntries: [url] }))
  return { history, stores: createPlaceStores(history) }
}

describe('place stores', () => {
  // Writes in one task share a history entry; each test starts a task of its own.
  beforeEach(() => new Promise((resolve) => setTimeout(resolve)))

  it('reads from the url and writes to it, opening the view a value belongs to', () => {
    const { history, stores } = setup('/changes')
    expect(stores.view.get()).toBe('changes')
    stores.pullSelection.set(12)
    expect(history.location.pathname).toBe('/prs/12')
    expect(stores.view.get()).toBe('prs')
    stores.pullTab.set('files')
    expect(history.location.href).toBe('/prs/12?tab=files')
    stores.pullSelection.set(13)
    expect(history.location.href).toBe('/prs/13')
  })

  it('comes back to where a view was left, keeping the comparison', () => {
    const { history, stores } = setup('/files?file=a.ts')
    stores.graphSelection.set('abc')
    expect(history.location.href).toBe('/graph?commit=abc')
    stores.view.set('files')
    expect(history.location.href).toBe('/files?file=a.ts')
  })

  it('tells a store only when its own part changes', () => {
    const { stores } = setup('/files?file=a.ts')
    const file = vi.fn()
    const line = vi.fn()
    stores.fileSelection.subscribe(file)
    stores.fileLine.subscribe(line)
    stores.fileLine.set(4)
    expect(line).toHaveBeenCalledTimes(1)
    expect(file).not.toHaveBeenCalled()
  })

  it('follows back and forward', () => {
    const { history, stores } = setup('/changes')
    stores.issueSelection.set(3)
    history.back()
    expect(stores.issueSelection.get()).toBeNull()
    expect(stores.view.get()).toBe('changes')
  })
})
