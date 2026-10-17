import { TooltipProvider } from '@duck-diff/ui'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyTool } from '../CopyTool'

afterEach(() => vi.useRealTimers())

describe('copy button', () => {
  it('copies, then shows a check on a green ground for a moment', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <TooltipProvider>
        <CopyTool label="Copy path" text="src/app.ts" />
      </TooltipProvider>,
    )
    const button = screen.getByRole('button', { name: 'Copy path' })
    vi.useFakeTimers()
    fireEvent.click(button)
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('src/app.ts'))
    await vi.waitFor(() => expect(button.className).toContain('text-added'))
    expect(button.querySelector('.lucide-check')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1600))
    expect(button.className).not.toContain('text-added')
    expect(button.querySelector('.lucide-copy')).toBeTruthy()
  })

  it('copies text that has to be fetched first', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <TooltipProvider>
        <CopyTool label="Copy as prompt" text={async () => 'the prompt'} />
      </TooltipProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Copy as prompt' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('the prompt'))
  })
})
