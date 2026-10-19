import type { ChangedFile, ConflictFile, DiffTarget, ToolSpec } from '@duck-diff/protocol'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeApi } from '../../test/fake-api'
import { App } from '../App'

const conflicted: ChangedFile = {
  path: 'a.txt',
  oldPath: null,
  status: 'conflicted',
  additions: 0,
  deletions: 0,
  binary: false,
  oldSha: null,
  newSha: null,
}

const file: ConflictFile = {
  path: 'a.txt',
  eol: '\n',
  finalNewline: true,
  stages: { base: null, ours: null, theirs: null },
  sides: { ours: null, theirs: null, base: null },
  segments: [
    {
      kind: 'conflict',
      ours: ['mine'],
      base: null,
      theirs: ['yours'],
      oursLabel: 'HEAD',
      baseLabel: null,
      theirsLabel: 'feature',
    },
  ],
}

const SPECS: Record<ToolSpec['kind'], ToolSpec> = {
  merge: { id: 't1', kind: 'merge', path: 'a.txt' },
  diff: {
    id: 't1',
    kind: 'diff',
    path: 'a.txt',
    target: { kind: 'range', from: 'aaaaaaa', to: 'bbbbbbb', mode: 'two-dot' },
  },
  rebase: {
    id: 't1',
    kind: 'rebase',
    steps: [{ commit: { sha: 'aaaaaaa', subject: 'First', author: 'Ada', time: 0 }, action: 'pick' }],
  },
}

afterEach(() => window.history.replaceState(null, '', '/'))

describe("git's tool window", () => {
  for (const kind of ['merge', 'diff', 'rebase'] as const)
    it(`keeps the settings and the shortcuts within reach in git's ${kind} tool`, async () => {
      window.history.replaceState(null, '', '/?tool=t1')
      const api = fakeApi({
        tool: async () => SPECS[kind],
        files: async (target: DiffTarget) => (target.kind === 'unstaged' ? [conflicted] : []),
        conflict: async () => file,
      })
      render(<App api={api} />)
      expect(await screen.findByRole('button', { name: 'Diff settings' })).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
      expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy()
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      fireEvent.keyDown(window, { key: '?' })
      expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy()
    })
})
