import { TooltipProvider } from '@duck-diff/ui'
import { act, render as mount, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TruncationTooltip } from '../TruncationTooltip'

function cut(element: HTMLElement, cutOff: boolean) {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: cutOff ? 300 : 100 })
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: 100 })
}

function clamp(element: HTMLElement, clamped: boolean) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: clamped ? 90 : 30 })
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 30 })
}

const render = (ui: ReactNode) => mount(<TooltipProvider>{ui}</TooltipProvider>)

const hover = (element: Element) =>
  act(() => {
    element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    vi.advanceTimersByTime(500)
  })

describe('TruncationTooltip', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows the whole text of cut-off or clamped text, and nothing for text that fits', () => {
    render(
      <>
        <span className="truncate">a/very/long/path/to/some/file.ts</span>
        <span className="truncate">short</span>
        <p className="line-clamp-2">a comment long enough to run past its two lines</p>
        <TruncationTooltip />
      </>,
    )
    const long = screen.getByText('a/very/long/path/to/some/file.ts')
    const short = screen.getByText('short')
    const clamped = screen.getByText('a comment long enough to run past its two lines')
    cut(long, true)
    cut(short, false)
    clamp(clamped, true)
    hover(short)
    expect(screen.queryByRole('tooltip')).toBeNull()
    hover(long)
    expect(screen.getByRole('tooltip').textContent).toBe('a/very/long/path/to/some/file.ts')
    // duck-ui's own tooltip, pointing at what it describes as every tooltip and popover on the page does.
    expect(document.querySelector('[data-slot="tooltip-arrow"]')).toBeTruthy()
    hover(clamped)
    expect(screen.getByRole('tooltip').textContent).toBe('a comment long enough to run past its two lines')
  })

  it("draws a title as the page's own tooltip instead of the browser's, keeping it as the name", () => {
    render(
      <>
        <button type="button" title="Pull">
          <svg />
        </button>
        <span data-own-tooltip className="truncate">
          has a tooltip of its own
        </span>
        <TruncationTooltip />
      </>,
    )
    const pull = screen.getByRole('button', { name: 'Pull' })
    hover(pull)
    expect(screen.getByRole('tooltip').textContent).toBe('Pull')
    // The browser's own tooltip would show beside it; the text moves where only the page reads it.
    expect(pull.hasAttribute('title')).toBe(false)
    expect(pull.getAttribute('aria-label')).toBe('Pull')
    const own = screen.getByText('has a tooltip of its own')
    cut(own, true)
    hover(own)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
