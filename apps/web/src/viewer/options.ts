import type { DiffTarget } from '@duck-diff/protocol'
import type { FileDiffContentsLoader } from '@pierre/diffs'
import type { CodeViewReactOptions } from '@pierre/diffs/react'
import type { CSSProperties } from 'react'
import type { Api } from '../lib/api'
import type { Settings } from '../state/settings'

const LAYOUT = { paddingTop: 8, paddingBottom: 64, gap: 12 }

export function viewerOptions(
  settings: Settings,
  loadDiffFiles: FileDiffContentsLoader,
): CodeViewReactOptions<undefined, undefined> {
  return {
    theme: settings.themes,
    themeType: settings.themeType,
    diffStyle: settings.diffStyle,
    diffIndicators: settings.diffIndicators,
    lineDiffType: settings.lineDiffType,
    hunkSeparators: settings.hunkSeparators,
    overflow: settings.overflow,
    disableLineNumbers: !settings.lineNumbers,
    disableBackground: !settings.backgrounds,
    expandUnchanged: settings.expandUnchanged,
    stickyHeaders: true,
    layout: LAYOUT,
    loadDiffFiles,
  }
}

export function viewerStyle(settings: Settings): CSSProperties {
  return {
    '--diffs-font-family': 'var(--dd-font-code)',
    '--diffs-font-size': `${settings.fontSize}px`,
    '--diffs-tab-size': String(settings.tabSize),
  } as CSSProperties
}

// Expanding unchanged lines needs both full files; the server reads them for the current comparison.
export function createContentLoader(api: Api, getTarget: () => DiffTarget): FileDiffContentsLoader {
  return async (fileDiff) => {
    const target = getTarget()
    const file = { path: fileDiff.name, oldPath: fileDiff.prevName ?? null }
    const oldName = fileDiff.prevName ?? fileDiff.name
    const newContents = (await api.content(target, 'new', file)) ?? ''
    const newFile = { name: fileDiff.name, contents: newContents }
    if (fileDiff.type === 'new') return { oldFile: null, newFile }
    const oldContents = (await api.content(target, 'old', file)) ?? ''
    return { oldFile: { name: oldName, contents: oldContents }, newFile }
  }
}
