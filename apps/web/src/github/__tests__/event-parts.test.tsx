import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppProvider } from '../../app/AppProvider'
import { fakeApi } from '../../test/fake-api'
import { EventParts } from '../EventParts'

afterEach(() => window.history.replaceState(null, '', '/'))

const api = fakeApi()
const parts = [
  { kind: 'user', login: 'octo' },
  { kind: 'text', text: ' mentioned this in ' },
  { kind: 'item', number: 12, title: 'Docs', pull: true, repo: null, url: 'u' },
  { kind: 'item', number: 3, title: 'Elsewhere', pull: false, repo: 'x/y', url: 'https://github.com/x/y/issues/3' },
  { kind: 'commit', sha: 'abcdef1234' },
  { kind: 'label', name: 'bug', color: 'd73a4a' },
] as const

describe('event parts', () => {
  it('links people to GitHub, items and commits into the page, and other repos to GitHub', async () => {
    render(
      <AppProvider
        api={{ ...api, github: { ...api.github, status: async () => ({ repo: 'o/r', user: null, source: 'gh' }) } }}>
        <EventParts parts={[...parts]} />
      </AppProvider>,
    )
    expect(screen.getByRole('link', { name: 'octo' }).getAttribute('href')).toBe('https://github.com/octo')
    expect(screen.getByRole('link', { name: /Elsewhere/ }).getAttribute('href')).toBe('https://github.com/x/y/issues/3')
    expect(screen.getByText('bug')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Docs/ }))
    await waitFor(() => expect(window.location.pathname).toBe('/prs/12'))
    fireEvent.click(screen.getByRole('button', { name: 'abcdef1' }))
    await waitFor(() => expect(window.location.pathname).toBe('/changes'))
    expect(decodeURIComponent(window.location.search)).toContain('"sha":"abcdef1234"')
  })
})
