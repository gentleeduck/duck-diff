import type { CodeViewItem } from '@pierre/diffs'
import type { CodeViewProps } from '@pierre/diffs/react'
import { useSession } from '../hooks/useSession'
import { useTarget } from '../hooks/useTarget'
import type { SessionState } from '../state/session'
import { useWrites } from '../writes/WritesProvider'
import { actionsFor, hunkAt, type WriteKind } from './actions'
import { WriteButtons } from './WriteButtons'

export type HoveredLineGetter = Parameters<NonNullable<CodeViewProps<undefined, undefined>['renderGutterUtility']>>[0]

const selectFiles = (state: SessionState) => state.files

// CodeView may keep the node from its first render, so this reads the current files and target itself
// instead of closing over values that could be stale by the time someone hovers.
export function HunkToolbar({
  item,
  getHoveredLine,
}: {
  item: CodeViewItem<undefined>
  getHoveredLine: HoveredLineGetter
}) {
  const files = useSession(selectFiles)
  const { target } = useTarget()
  const writes = useWrites()
  const kinds = actionsFor(target)
  if (item.type !== 'diff' || kinds.length === 0) return null
  const file = files.find((entry) => entry.path === item.fileDiff.name)
  if (!file || file.status === 'untracked') return null

  const act = (kind: WriteKind) => {
    const line = getHoveredLine()
    const side = line && 'side' in line ? (line.side as 'additions' | 'deletions') : 'additions'
    const index = line ? hunkAt(item.fileDiff.hunks, line.lineNumber, side) : null
    const hunk = index === null ? undefined : item.fileDiff.hunks[index]
    if (index !== null && hunk) void writes.perform(kind, file, { index, hunk })
  }

  return (
    <span className="flex rounded-sm bg-[var(--dd-surface)] shadow-md ring-1 ring-[var(--dd-line)]">
      <WriteButtons kinds={kinds} scope="change" onWrite={act} compact />
    </span>
  )
}
