import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PathLabel } from '../PathLabel'

describe('path label', () => {
  it('keeps the file name apart from its folders, so the folders are cut first', () => {
    render(<PathLabel path="apps/api/src/file-objects.controller.ts" />)
    const label = screen.getByTitle('apps/api/src/file-objects.controller.ts')
    expect(label.textContent).toBe('apps/api/src/file-objects.controller.ts')
    expect(screen.getByText('apps/api/src/').className).toContain('truncate')
    expect(screen.getByText('file-objects.controller.ts').className).toContain('shrink-0')
  })

  it('shows a file at the root as its name alone', () => {
    render(<PathLabel path="README.md" />)
    expect(screen.getByTitle('README.md').children).toHaveLength(1)
  })
})
