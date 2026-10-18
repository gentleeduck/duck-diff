import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../app/App'
import { fakeApi } from '../../test/fake-api'

const type = (name: string, value: string) =>
  fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } })

describe('hide patterns', () => {
  it('opens an edit with the name the row shows, and a name that is only the regex follows it', async () => {
    render(<App api={fakeApi()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Hide files' }))
    type('New pattern name', 'Snapshots')
    type('New hide pattern', '\\.snap$')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    type('New hide pattern', '^docs/')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    fireEvent.click(screen.getByRole('button', { name: 'Edit Snapshots' }))
    expect(screen.getByRole('textbox', { name: 'Name for Snapshots' })).toHaveProperty('value', 'Snapshots')
    fireEvent.click(screen.getByRole('button', { name: 'Drop the edit' }))

    fireEvent.click(screen.getByRole('button', { name: 'Edit ^docs/' }))
    expect(screen.getByRole('textbox', { name: 'Name for ^docs/' })).toHaveProperty('value', '^docs/')
    type('Pattern for ^docs/', '^doc/')
    expect(screen.getByRole('textbox', { name: 'Name for ^docs/' })).toHaveProperty('value', '^doc/')
    fireEvent.click(screen.getByRole('button', { name: 'Keep the pattern' }))
    expect(screen.getByRole('button', { name: 'Edit ^doc/' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit Snapshots' })).toBeTruthy()
  })
})
