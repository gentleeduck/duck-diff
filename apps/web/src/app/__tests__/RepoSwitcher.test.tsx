import type { Worktree } from '@duck-diff/protocol'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeApi } from '../../test/fake-api'
import { App } from '../App'

afterEach(() => vi.restoreAllMocks())

const tree = (path: string, branch: string, more: Partial<Worktree> = {}): Worktree => ({
  path,
  head: 'abc',
  branch,
  main: false,
  current: false,
  locked: false,
  prunable: false,
  ...more,
  separate: more.separate ?? false,
})

describe('repo switcher', () => {
  it("lists this repo's other worktrees and opens one in its own tab", async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const openRepo = vi.fn(async () => ({ url: 'http://127.0.0.1:2/', opened: true }))
    const worktrees = async () => [
      tree('/r', 'main', { main: true, current: true }),
      tree('/r-next', 'feat'),
      tree('/r-gone', 'old', { prunable: true }),
    ]
    render(<App api={fakeApi({ worktrees, openRepo })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }))
    const list = await screen.findByRole('list', { name: 'Worktrees' })
    // Still there to hover for their card, but not to open: one is this page, the other is gone.
    expect(within(list).getByRole('button', { name: /main/ }).getAttribute('aria-disabled')).toBe('true')
    expect(within(list).getByRole('button', { name: /old/ }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(within(list).getByRole('button', { name: /old/ }))
    expect(openRepo).not.toHaveBeenCalled()
    fireEvent.click(within(list).getByRole('button', { name: /feat/ }))
    await waitFor(() => expect(openRepo).toHaveBeenCalledWith('/r-next'))
    // The server opened it the way this page was opened, so the page opens nothing itself.
    expect(open).not.toHaveBeenCalled()
  })

  it('opens the page itself when the server could not', async () => {
    const tab = {} as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(tab)
    const openRepo = vi.fn(async () => ({ url: 'http://127.0.0.1:2/', opened: false }))
    const worktrees = async () => [tree('/r', 'main', { main: true, current: true }), tree('/r-next', 'feat')]
    render(<App api={fakeApi({ worktrees, openRepo })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }))
    fireEvent.click(
      within(await screen.findByRole('list', { name: 'Worktrees' })).getByRole('button', { name: /feat/ }),
    )
    await waitFor(() => expect(open).toHaveBeenCalledWith('http://127.0.0.1:2/', '_blank'))
  })

  it('lists each checkout once: worktrees under Worktrees, only other repositories under Repositories', async () => {
    const worktrees = async () => [tree('/r', 'main', { main: true, current: true }), tree('/r-next', 'feat')]
    const repos = async () => [
      { path: '/r', name: 'r', current: true },
      { path: '/r-next', name: 'r-next', current: false },
      { path: '/other', name: 'other', current: false },
    ]
    render(<App api={fakeApi({ worktrees, repos })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }))
    await screen.findByRole('list', { name: 'Worktrees' })
    const listed = within(await screen.findByRole('list', { name: 'Repositories' }))
    await waitFor(() => expect(listed.getByRole('button', { name: /^other/ })).toBeTruthy())
    // The other repository and its Forget button, nothing for this repo or its worktree.
    expect(
      listed.getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual(['other/other', 'Forget /other'])
  })

  it('shows a card on hover with the path, what the checkout is and the commit it is on', async () => {
    const worktrees = async () => [
      tree('/r', 'main', { main: true, current: true }),
      tree('/r/.claude/worktrees/copy', 'synced', { separate: true, head: 'c'.repeat(40) }),
    ]
    const commit = async () => ({
      sha: 'c'.repeat(40),
      parents: [],
      authorName: 'Duck',
      authorEmail: 'd@d',
      authoredAt: 0,
      committerName: 'Duck',
      committedAt: Math.floor(Date.now() / 1000) - 3600,
      message: 'Sync the copy\n\nbody',
    })
    render(<App api={fakeApi({ worktrees, commit })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }))
    const row = within(await screen.findByRole('list', { name: 'Worktrees' })).getByRole('button', { name: /synced/ })
    expect(row.textContent).toContain('separate')
    fireEvent.pointerEnter(row)
    fireEvent.focus(row)
    expect(await screen.findByText('/r/.claude/worktrees/copy', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText(/separate copy: git does not list it/)).toBeTruthy()
    expect(await screen.findByText('Sync the copy')).toBeTruthy()
    expect(screen.getByText('ccccccc')).toBeTruthy()
  })

  it('shows the lists loading, and says so when there is no other repository', async () => {
    let answer: (repos: { path: string; name: string; current: boolean }[]) => void = () => {}
    const repos = () => new Promise<{ path: string; name: string; current: boolean }[]>((resolve) => (answer = resolve))
    const worktrees = async () => [tree('/r', 'main', { main: true, current: true }), tree('/r-next', 'feat')]
    render(<App api={fakeApi({ worktrees, repos })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }))
    expect(await screen.findByRole('status', { name: 'Loading repositories' })).toBeTruthy()
    answer([{ path: '/r', name: 'r', current: true }])
    expect(await screen.findByText(/No other repositories yet/)).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Loading repositories' })).toBeNull()
  })

  it('says why the list failed, with a retry', async () => {
    let fail = true
    const repos = vi.fn(async () => {
      if (fail) throw new Error('disk on fire')
      return [{ path: '/r', name: 'r', current: true }]
    })
    render(<App api={fakeApi({ repos })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }))
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 })
    expect(alert.textContent).toContain('disk on fire')
    fail = false
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(within(screen.getByRole('list', { name: 'Repositories' })).getByRole('button', { name: /^r/ })).toBeTruthy()
  })

  it('leaves the worktrees out when the repo has only its own checkout', async () => {
    render(<App api={fakeApi({ worktrees: async () => [tree('/r', 'main', { main: true, current: true })] })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }))
    await screen.findByRole('list', { name: 'Repositories' })
    expect(screen.queryByRole('list', { name: 'Worktrees' })).toBeNull()
  })
})

describe('toasts', () => {
  it("draw in the theme's own colours, dark like every theme", async () => {
    render(<App api={fakeApi()} />)
    await screen.findByRole('banner')
    toast('Pruned')
    const toaster = (await screen.findByText('Pruned')).closest('[data-sonner-toaster]') as HTMLElement
    expect(toaster.style.getPropertyValue('--normal-bg')).toBe('var(--popover)')
    expect(toaster.style.getPropertyValue('--width')).toBe('28rem')
    expect(toaster.getAttribute('data-sonner-theme')).toBe('dark')
  })
})
