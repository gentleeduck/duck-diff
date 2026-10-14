import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProvider } from '../../app/AppProvider'
import { fakeApi } from '../../test/fake-api'
import { useTarget } from '../useTarget'

afterEach(() => window.history.replaceState(null, '', '/'))

function wrapper(api = fakeApi()) {
  return ({ children }: { children: ReactNode }) => <AppProvider api={api}>{children}</AppProvider>
}

describe('useTarget', () => {
  it('reads the target from the url', () => {
    window.history.replaceState(null, '', `/?target=${encodeURIComponent('{"kind":"staged"}')}`)
    const { result } = renderHook(() => useTarget(), { wrapper: wrapper() })
    expect(result.current.target).toEqual({ kind: 'staged' })
  })

  it('navigates, loads, and restores on back', async () => {
    const api = fakeApi()
    const files = vi.spyOn(api, 'files')
    const { result } = renderHook(() => useTarget(), { wrapper: wrapper(api) })
    act(() => result.current.navigate({ kind: 'unstaged' }))
    expect(result.current.target).toEqual({ kind: 'unstaged' })
    expect(window.location.search).toContain('unstaged')
    expect(files).toHaveBeenLastCalledWith({ kind: 'unstaged' }, expect.anything())
    window.history.back()
    await waitFor(() => expect(result.current.target).toEqual({ kind: 'local' }))
  })
})
