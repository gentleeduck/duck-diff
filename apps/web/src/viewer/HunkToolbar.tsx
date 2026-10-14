import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import type { CodeViewItem } from '@pierre/diffs'
import type { CodeViewProps } from '@pierre/diffs/react'
import { MessageSquarePlus } from 'lucide-react'
import { useApp } from '../app/AppProvider'
import { useSession } from '../hooks/useSession'
import { useTarget } from '../hooks/useTarget'
import { lineHash, lineText, type Side } from '../review/anchor'
import type { Note } from '../review/annotations'
import type { SessionState } from '../state/session'
import { useWrites } from '../writes/WritesProvider'
import { actionsFor, hunkAt, type WriteKind } from './actions'
import { WriteButtons } from './WriteButtons'

export type HoveredLineGetter = Parameters<NonNullable<CodeViewProps<Note, undefined>['renderGutterUtility']>>[0]

const selectFiles = (state: SessionState) => state.files

// CodeView may keep the node from its first render, so this reads the current files and target itself
// instead of closing over values that could be stale by the time someone hovers.
export function HunkToolbar({ item, getHoveredLine }: { item: CodeViewItem<Note>; getHoveredLine: HoveredLineGetter }) {
  const files = useSession(selectFiles)
  const { target } = useTarget()
  const { reviews } = useApp()
  const writes = useWrites()
  if (item.type !== 'diff') return null
  const file = files.find((entry) => entry.path === item.fileDiff.name)
  const kinds = file && file.status !== 'untracked' && file.status !== 'conflicted' ? actionsFor(target) : []

  const hovered = () => {
    const line = getHoveredLine()
    if (!line) return null
    const side: Side = 'side' in line && line.side === 'deletions' ? 'deletions' : 'additions'
    return { line: line.lineNumber, side }
  }

  const act = (kind: WriteKind) => {
    const at = hovered()
    const index = at ? hunkAt(item.fileDiff.hunks, at.line, at.side) : null
    const hunk = index === null ? undefined : item.fileDiff.hunks[index]
    if (file && index !== null && hunk) void writes.perform(kind, file, { index, hunk })
  }

  const comment = () => {
    const at = hovered()
    if (!at) return
    const text = lineText(item.fileDiff, at.side, at.line) ?? ''
    reviews.startDraft({ path: item.fileDiff.name, side: at.side, line: at.line, lineHash: lineHash(text) })
  }

  return (
    // Above the line number, which otherwise paints over the button that sits on top of it.
    <span className="relative z-10 flex rounded-sm bg-[var(--dd-surface)] shadow-md ring-1 ring-[var(--dd-line)]">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 rounded-sm"
            aria-label="Comment on line"
            onClick={(event) => {
              event.stopPropagation()
              comment()
            }}>
            <MessageSquarePlus className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Comment on line</TooltipContent>
      </Tooltip>
      <WriteButtons kinds={kinds} scope="change" onWrite={act} compact />
    </span>
  )
}
