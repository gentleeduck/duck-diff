import type { FileDiffMetadata } from '@pierre/diffs'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../state/settings'
import { fakeApi } from '../../test/fake-api'
import { createContentLoader, viewerOptions, viewerStyle } from '../options'

function diff(partial: Partial<FileDiffMetadata>): FileDiffMetadata {
  return {
    name: 'a.ts',
    type: 'change',
    hunks: [],
    splitLineCount: 0,
    unifiedLineCount: 0,
    ...partial,
  } as FileDiffMetadata
}

describe('viewerOptions', () => {
  it('maps every setting', () => {
    const loader = vi.fn()
    const options = viewerOptions(
      { ...DEFAULT_SETTINGS, diffStyle: 'unified', lineNumbers: false, backgrounds: false, expandUnchanged: true },
      loader,
    )
    expect(options).toMatchObject({
      diffStyle: 'unified',
      diffIndicators: DEFAULT_SETTINGS.diffIndicators,
      lineDiffType: DEFAULT_SETTINGS.lineDiffType,
      hunkSeparators: DEFAULT_SETTINGS.hunkSeparators,
      overflow: DEFAULT_SETTINGS.overflow,
      disableLineNumbers: true,
      disableBackground: true,
      expandUnchanged: true,
      themeType: 'dark',
      theme: DEFAULT_SETTINGS.themes,
      stickyHeaders: true,
      loadDiffFiles: loader,
    })
  })

  it('exposes font and tab size as css variables', () => {
    expect(viewerStyle({ ...DEFAULT_SETTINGS, fontSize: 15, tabSize: 4 })).toMatchObject({
      '--diffs-font-size': '15px',
      '--diffs-tab-size': '4',
    })
  })
})

describe('createContentLoader', () => {
  it('loads both sides, using the old name on renames', async () => {
    const api = fakeApi({ content: vi.fn(async (_t, side, file) => `${side}:${file.oldPath ?? file.path}`) })
    const load = createContentLoader(api, () => ({ kind: 'staged' }))
    const result = await load(diff({ name: 'b.ts', prevName: 'a.ts', type: 'rename-changed' }))
    expect(result).toEqual({
      oldFile: { name: 'a.ts', contents: 'old:a.ts' },
      newFile: { name: 'b.ts', contents: 'new:a.ts' },
    })
    expect(api.content).toHaveBeenCalledWith({ kind: 'staged' }, 'new', { path: 'b.ts', oldPath: 'a.ts' })
  })

  it('returns no old file for added files and empty contents for missing sides', async () => {
    const api = fakeApi({ content: async (_t, side) => (side === 'new' ? 'x' : null) })
    const load = createContentLoader(api, () => ({ kind: 'unstaged' }))
    expect(await load(diff({ type: 'new' }))).toEqual({ oldFile: null, newFile: { name: 'a.ts', contents: 'x' } })
    const deleted = createContentLoader(
      fakeApi({ content: async (_t, side) => (side === 'old' ? 'gone' : null) }),
      () => ({ kind: 'unstaged' }),
    )
    expect(await deleted(diff({ type: 'deleted' }))).toEqual({
      oldFile: { name: 'a.ts', contents: 'gone' },
      newFile: { name: 'a.ts', contents: '' },
    })
  })
})
