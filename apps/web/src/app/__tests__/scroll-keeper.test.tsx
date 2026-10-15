import { act, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScrollKeeper } from '../ScrollKeeper'

// jsdom has no layout: a tall area with a scrollTop that keeps what is set, up to its end.
function tall(element: HTMLElement) {
  let top = 0
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 2000 })
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 200 })
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (next: number) => {
      top = Math.max(0, Math.min(1800, next))
    },
  })
}

let show: (next: boolean) => void = () => {}
function Page() {
  const [shown, setShown] = useState(true)
  show = setShown
  return (
    <>
      {shown ? (
        <nav
          aria-label="Branches and tags"
          className="overflow-y-auto"
          ref={(element) => {
            if (element) tall(element)
          }}
        />
      ) : null}
      <ScrollKeeper view="graph" />
    </>
  )
}

describe('ScrollKeeper', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('puts a scrolling area back where it was when it shows again', async () => {
    const { container } = render(<Page />)
    const list = () => container.querySelector('nav') as HTMLElement
    list().scrollTop = 300
    list().dispatchEvent(new Event('scroll'))
    act(() => show(false))
    act(() => show(true))
    // The new element is noticed by a MutationObserver, whose callback runs as a microtask.
    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(200)
    })
    expect(list().scrollTop).toBe(300)
  })
})
