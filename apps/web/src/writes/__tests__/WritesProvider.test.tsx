import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppProvider } from '../../app/AppProvider'
import { ApiError } from '../../lib/api'
import { FILES, fakeApi } from '../../test/fake-api'
import { useWrites, WritesProvider } from '../WritesProvider'

let writes: ReturnType<typeof useWrites>
function Probe() {
  writes = useWrites()
  return null
}

function mount(api = fakeApi()) {
  render(
    <AppProvider api={api}>
      <WritesProvider>
        <Probe />
      </WritesProvider>
    </AppProvider>,
  )
  return api
}

const file = FILES[0] as (typeof FILES)[number]

describe('WritesProvider', () => {
  it('stages a file without asking', async () => {
    const api = mount(fakeApi({ write: vi.fn(async () => {}) }))
    await act(() => writes.perform('stage', file))
    expect(api.write).toHaveBeenCalledWith({ action: 'stage-file', file: expect.objectContaining({ path: 'a.ts' }) })
  })

  it('asks before discarding and does nothing when kept', async () => {
    const api = mount(fakeApi({ write: vi.fn(async () => {}) }))
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = writes.perform('discard', file)
    })
    expect(await screen.findByText(/Discard a.ts\?/)).toBeTruthy()
    fireEvent.click(screen.getByText('Keep'))
    await act(() => done)
    expect(api.write).not.toHaveBeenCalled()
  })

  it('discards after confirming', async () => {
    const api = mount(fakeApi({ write: vi.fn(async () => {}) }))
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = writes.perform('discard', file)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }))
    await act(() => done)
    expect(api.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'discard-file' }))
  })

  it('reloads after a stale write', async () => {
    const api = mount(
      fakeApi({
        write: async () => {
          throw new ApiError(409, 'stale', 'moved')
        },
      }),
    )
    const files = vi.spyOn(api, 'files')
    await act(() => writes.perform('stage', file))
    await waitFor(() => expect(files).toHaveBeenCalled())
  })
})
