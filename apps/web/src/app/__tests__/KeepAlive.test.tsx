import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { KeepAlive } from '../KeepAlive'

describe('KeepAlive', () => {
  it('draws a tab the first time it shows, then keeps it, paused while hidden', () => {
    const mounted = vi.fn()
    const unmounted = vi.fn()
    let renders = 0
    function Tab() {
      renders++
      useEffect(() => {
        mounted()
        return unmounted
      }, [])
      return <p>tab body</p>
    }
    const { rerender } = render(
      <KeepAlive active={false}>
        <Tab />
      </KeepAlive>,
    )
    expect(screen.queryByText('tab body')).toBeNull()
    expect(renders).toBe(0)

    rerender(
      <KeepAlive active>
        <Tab />
      </KeepAlive>,
    )
    expect(screen.getByText('tab body')).toBeTruthy()
    expect(mounted).toHaveBeenCalledTimes(1)

    act(() =>
      rerender(
        <KeepAlive active={false}>
          <Tab />
        </KeepAlive>,
      ),
    )
    // Still in the page, its effects stopped.
    expect(screen.getByText('tab body', { selector: 'p' })).toBeTruthy()
    expect(unmounted).toHaveBeenCalledTimes(1)

    act(() =>
      rerender(
        <KeepAlive active>
          <Tab />
        </KeepAlive>,
      ),
    )
    expect(mounted).toHaveBeenCalledTimes(2)
  })
})
