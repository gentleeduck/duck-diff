import type { ChangedFile } from '@duck-diff/protocol'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FileHeader } from '../FileHeader'

const file = (over: Partial<ChangedFile>): ChangedFile => ({
  path: 'b.ts',
  oldPath: null,
  status: 'modified',
  additions: 3,
  deletions: 1,
  binary: false,
  oldSha: 'o',
  newSha: 'n',
  ...over,
})

const header = (changed: ChangedFile) =>
  render(
    <FileHeader path={changed.path} file={changed} collapsed={false} onToggle={() => {}}>
      <button type="button">Open</button>
    </FileHeader>,
  )

describe('file header', () => {
  it('counts the lines a file changed', () => {
    header(file({}))
    expect(screen.getByText('+3')).toBeTruthy()
    expect(screen.getByText('-1')).toBeTruthy()
  })

  it('leaves out +0 -0 when no line changed, as the note says why', () => {
    header(file({ status: 'renamed', oldPath: 'a.ts', additions: 0, deletions: 0 }))
    expect(screen.getByTitle('Renamed without changes')).toBeTruthy()
    expect(screen.queryByText('+0')).toBeNull()
    expect(screen.queryByText('-0')).toBeNull()
  })
})
