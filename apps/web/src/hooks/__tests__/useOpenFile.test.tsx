import { render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AppProvider, useApp } from '../../app/AppProvider'
import { fakeApi } from '../../test/fake-api'
import { useOpenFile } from '../useOpenFile'

function OpenOnce() {
  const { settings } = useApp()
  const open = useOpenFile()
  useEffect(() => {
    settings.set((now) => ({ ...now, editor: 'cursor' }))
  }, [settings])
  return (
    <button type="button" onClick={() => void open('a.ts', 7)}>
      open
    </button>
  )
}

describe('useOpenFile', () => {
  it('opens in the editor chosen in the settings', async () => {
    localStorage.clear()
    const open = vi.fn(async () => ({ how: 'editor' as const, command: 'cursor' }))
    const view = render(
      <AppProvider api={fakeApi({ open })}>
        <OpenOnce />
      </AppProvider>,
    )
    view.getByRole('button', { name: 'open' }).click()
    await waitFor(() => expect(open).toHaveBeenCalledWith('a.ts', 7, 'cursor'))
  })
})
