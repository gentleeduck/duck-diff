import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeApi } from '../../test/fake-api'
import { App } from '../App'

describe('App', () => {
  it('renders the shell regions', async () => {
    render(<App api={fakeApi()} />)
    // The router renders the shell once it has matched the url.
    expect(await screen.findByRole('banner')).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Changed files' })).toBeTruthy()
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByRole('contentinfo')).toBeTruthy()
  })
})

describe('keyboard shortcuts', () => {
  it('opens the list of every key binding from the rail', async () => {
    render(<App api={fakeApi()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Keyboard shortcuts' }))
    const dialog = await screen.findByRole('dialog', { name: 'Keymaps' })
    expect(within(dialog).getByText('Pull with rebase')).toBeTruthy()
  })
})
