import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../app/App'
import { fakeApi } from '../../test/fake-api'

afterEach(() => {
  window.localStorage.removeItem('duck-diff:settings')
  window.history.replaceState(null, '', '/')
})

describe('Files with nothing open', () => {
  it('offers the hidden file tree instead of pointing at it', async () => {
    window.localStorage.setItem('duck-diff:settings', JSON.stringify({ hiddenPanels: ['files'] }))
    window.history.replaceState(null, '', '/files')
    render(<App api={fakeApi()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show the file tree' }))
    expect(await screen.findByRole('tree', { name: 'All files' })).toBeTruthy()
  })
})
