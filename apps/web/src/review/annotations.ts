import type { ChangedFile, ReviewComment } from '@duck-diff/protocol'
import type { CodeViewDiffItem, DiffLineAnnotation } from '@pierre/diffs'
import { isImage } from '../viewer/file-info'
import { anchorComments, type Side } from './anchor'

export interface Draft {
  path: string
  side: Side
  line: number
  lineHash: string
}

export type Note =
  | { kind: 'comment'; comment: ReviewComment; outdated: boolean }
  | { kind: 'draft'; draft: Draft }
  | { kind: 'image'; file: ChangedFile }

export type NoteItem = CodeViewDiffItem<Note>

interface Cached {
  base: CodeViewDiffItem<undefined>
  key: string
  out: NoteItem
}

// CodeView only re-renders an item whose version changed, so every new object gets a fresh version
// and an unchanged file keeps its old object to skip the update entirely. Folded paths (viewed files) collapse.
export function createAnnotator() {
  const cache = new Map<string, Cached>()
  let version = 0

  return (
    items: readonly CodeViewDiffItem<undefined>[],
    comments: readonly ReviewComment[],
    draft: Draft | null,
    folded: ReadonlySet<string> = new Set(),
    files: readonly ChangedFile[] = [],
    opened: ReadonlySet<string> = new Set(),
  ): NoteItem[] => {
    const images = new Map(files.filter((file) => file.binary && isImage(file.path)).map((file) => [file.path, file]))
    const byPath = new Map<string, ReviewComment[]>()
    for (const comment of comments) byPath.set(comment.path, [...(byPath.get(comment.path) ?? []), comment])

    const live = new Set(items.map((item) => item.id))
    for (const id of cache.keys()) if (!live.has(id)) cache.delete(id)

    return items.map((item) => {
      const path = item.fileDiff.name
      const annotations: DiffLineAnnotation<Note>[] = anchorComments(byPath.get(path) ?? [], item.fileDiff).map(
        ({ comment, line, outdated }) => ({
          side: comment.side,
          lineNumber: line,
          metadata: { kind: 'comment', comment, outdated },
        }),
      )
      const image = images.get(path)
      // Binary images have no lines, so their preview sits above the (empty) diff as a file-level note.
      if (image) annotations.unshift({ side: 'additions', lineNumber: 0, metadata: { kind: 'image', file: image } })
      if (draft?.path === path) {
        annotations.push({ side: draft.side, lineNumber: draft.line, metadata: { kind: 'draft', draft } })
      }
      // An explicit open beats both the viewed mark and the size rule that folds big files.
      const collapsed = !opened.has(path) && (folded.has(path) || Boolean(item.collapsed))
      const key = JSON.stringify([collapsed, annotations])
      const cached = cache.get(item.id)
      if (cached && cached.base === item && cached.key === key) return cached.out
      const out: NoteItem = { ...(item as NoteItem), annotations, collapsed, version: ++version }
      cache.set(item.id, { base: item, key, out })
      return out
    })
  }
}
