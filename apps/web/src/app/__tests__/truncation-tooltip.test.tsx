import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TruncationTooltip } from '../TruncationTooltip'

function cut(element: HTMLElement, cutOff: boolean) {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: cutOff ? 300 : 100 })
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: 100 })
}

describe('TruncationTooltip', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows the whole text of a cut-off element, and nothing for one that fits or has its own title', () => {
    render(
      <>
        <span className="truncate">a/very/long/path/to/some/file.ts</span>
        <span className="truncate">short</span>
        <span className="truncate" title="own">
          has a title
        </span>
        <TruncationTooltip />
      </>,
    )
    const long = screen.getByText('a/very/long/path/to/some/file.ts')
    const short = screen.getByText('short')
    const titled = screen.getByText('has a title')
    cut(long, true)
    cut(short, false)
    cut(titled, true)
    for (const [element, expected] of [
      [short, false],
      [titled, false],
      [long, true],
    ] as const) {
      act(() => {
        element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
        vi.advanceTimersByTime(500)
      })
      expect(screen.queryByRole('tooltip') !== null).toBe(expected)
    }
    expect(screen.getByRole('tooltip').textContent).toBe('a/very/long/path/to/some/file.ts')
  })
})
