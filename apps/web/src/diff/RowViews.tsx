import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { ChevronsUpDown, MessageSquarePlus, Minus, Plus, Undo2 } from 'lucide-react'
import { createContext, memo, useContext, useMemo, useSyncExternalStore } from 'react'
import type { NoteItem } from '../review/annotations'
import type { Settings } from '../state/settings'
import type { WriteKind } from '../viewer/actions'
import { Code } from './Code'
import type { Token } from './highlight'
import { highlighter } from './highlighter'
import type { DiffLine, DiffRow } from './rows'
import { changedRanges } from './words'

export interface RowContextValue {
  settings: Settings
  tokens(item: NoteItem, side: 'old' | 'new', line: number): Token[] | undefined
  // Starts a file's colors before it scrolls into view.
  prefetch(item: NoteItem): void
  kinds(item: NoteItem): WriteKind[]
  // Extend grows the open comment's range to this line, for shift-click and dragging.
  comment(item: NoteItem, line: DiffLine, side: 'additions' | 'deletions', extend?: boolean): void
  // Drag from a line's comment button over other lines to cover them all.
  startSelect(item: NoteItem, line: DiffLine, side: 'additions' | 'deletions'): void
  dragOver(item: NoteItem, line: DiffLine, side: 'additions' | 'deletions'): void
  subscribeMarks(listener: () => void): () => void
  // How a line is marked for comments: '' for none, 'draft' or 'comment', then '|from-to' when only some
  // of its characters are picked. A string, so a line re-renders only when its own mark changes.
  lineMark(item: NoteItem, side: 'additions' | 'deletions', line: number | null, length: number): string
  write(kind: WriteKind, item: NoteItem, hunk: number): void
  expand(item: NoteItem, gap: Extract<DiffRow, { type: 'gap' }>): void
}

export const RowContext = createContext<RowContextValue | null>(null)

function useRow(): RowContextValue {
  const value = useContext(RowContext)
  if (!value) throw new Error('rows need a RowContext')
  return value
}

const WRITE = {
  stage: { icon: Plus, label: 'Stage change' },
  unstage: { icon: Minus, label: 'Unstage change' },
  discard: { icon: Undo2, label: 'Discard change' },
} as const

const BG: Record<DiffLine['kind'], string> = {
  addition: 'bg-[var(--diff-add-bg)]',
  deletion: 'bg-[var(--diff-del-bg)]',
  context: '',
}
const MARK: Record<DiffLine['kind'], string> = {
  addition: '[&_[data-mark]]:bg-[var(--diff-add-word)]',
  deletion: '[&_[data-mark]]:bg-[var(--diff-del-word)]',
  context: '',
}
const BAR: Record<DiffLine['kind'], string> = {
  addition: 'border-added',
  deletion: 'border-removed',
  context: 'border-transparent',
}
const SIGN: Record<DiffLine['kind'], string> = { addition: '+', deletion: '-', context: ' ' }

function Toolbar({ item, line, side }: { item: NoteItem; line: DiffLine; side: 'additions' | 'deletions' }) {
  const { kinds, comment, startSelect, write } = useRow()
  const writable = line.hunk >= 0 ? kinds(item) : []
  return (
    <span className="absolute inset-y-0 start-0 z-10 hidden items-center gap-0.5 bg-popover px-0.5 group-hover/line:flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Comment on line"
            // Starting a line selection must not start a text selection under it.
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              if (event.shiftKey) comment(item, line, side, true)
              else startSelect(item, line, side)
            }}
            // Keyboard activation; pointer presses are handled on the way down.
            onClick={(event) => event.detail === 0 && comment(item, line, side)}>
            <MessageSquarePlus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Comment on line (drag or shift-click for several)</TooltipContent>
      </Tooltip>
      {writable.map((kind) => {
        const { icon: Icon, label } = WRITE[kind]
        return (
          <Tooltip key={kind}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={kind === 'discard' ? 'text-destructive hover:text-destructive' : undefined}
                aria-label={label}
                onClick={() => write(kind, item, line.hunk)}>
                <Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </span>
  )
}

function Cell({
  item,
  line,
  side,
  numbers,
}: {
  item: NoteItem
  line: DiffLine | null
  side: 'additions' | 'deletions'
  numbers: 'both' | 'one'
}) {
  const { settings, tokens, dragOver, subscribeMarks, lineMark } = useRow()
  const number = line ? (side === 'additions' ? line.newNo : line.oldNo) : null
  const mark = useSyncExternalStore(subscribeMarks, () => lineMark(item, side, number, line?.text.length ?? 0))
  const [markKind, markCols] = mark.split('|')
  const picks = useMemo(() => {
    const [from, to] = (markCols ?? '').split('-').map(Number)
    return markCols && from !== undefined && to !== undefined && to > from
      ? ([[from, to]] as [number, number][])
      : undefined
  }, [markCols])
  const tokenSide = line?.kind === 'deletion' ? 'old' : 'new'
  const tokenLine = line ? (tokenSide === 'old' ? line.oldNo : line.newNo) : null
  // Each line listens for its own colors, so a file's tokens landing repaints just its rows on screen.
  const lineTokens = useSyncExternalStore(highlighter.subscribe, () =>
    tokenLine === null ? undefined : tokens(item, tokenSide, tokenLine),
  )
  const marks = useMemo(() => {
    if (!line?.partner || settings.lineDiffType === 'none') return undefined
    const mode = settings.lineDiffType === 'char' ? 'char' : 'word'
    const [before, after] = line.kind === 'deletion' ? [line.text, line.partner] : [line.partner, line.text]
    const ranges = changedRanges(before, after, mode)
    return line.kind === 'deletion' ? ranges.old : ranges.new
  }, [line, settings.lineDiffType])

  if (!line)
    return (
      <div className="min-w-0 flex-1 bg-[repeating-linear-gradient(-45deg,transparent_0_6px,var(--border)_6px_7px)]" />
    )

  const wrap = settings.overflow === 'wrap'
  return (
    <div
      data-line={number ?? undefined}
      data-side={side}
      onPointerEnter={() => dragOver(item, line, side)}
      className={`group/line relative flex min-w-0 flex-1 ${settings.backgrounds ? BG[line.kind] : ''} ${MARK[line.kind]} ${
        markKind === 'draft'
          ? 'bg-tn-yellow/20! shadow-[inset_3px_0_0_var(--tn-yellow)]'
          : markKind === 'comment'
            ? 'shadow-[inset_3px_0_0_color-mix(in_oklab,var(--tn-yellow)_55%,transparent)]'
            : ''
      }
      }`}>
      {settings.lineNumbers ? (
        <span className="relative flex shrink-0 select-none text-tn-gutter tabular-nums">
          {numbers === 'both' || side === 'deletions' ? (
            <span className="w-12 pe-2 text-end">{line.oldNo ?? ''}</span>
          ) : null}
          {numbers === 'both' || side === 'additions' ? (
            <span className="w-12 pe-2 text-end">{line.newNo ?? ''}</span>
          ) : null}
          <Toolbar item={item} line={line} side={side} />
        </span>
      ) : (
        <span className="relative w-6 shrink-0">
          <Toolbar item={item} line={line} side={side} />
        </span>
      )}
      <span
        className={`w-4 shrink-0 select-none border-s-2 text-center ${
          settings.diffIndicators === 'bars' ? BAR[line.kind] : 'border-transparent'
        } ${line.kind === 'addition' ? 'text-added' : line.kind === 'deletion' ? 'text-removed' : ''}`}>
        {settings.diffIndicators === 'classic' ? SIGN[line.kind] : ''}
      </span>
      <code
        data-code
        className={`min-w-0 flex-1 pe-4 ${wrap ? 'whitespace-pre-wrap break-all' : 'overflow-hidden whitespace-pre'}`}>
        {wrap ? (
          <Code text={line.text} tokens={lineTokens} marks={marks} />
        ) : (
          <span className="relative inline-block translate-x-[calc(var(--code-x,0px)*-1)]">
            {picks ? <Pick text={line.text} range={picks[0]} tabSize={settings.tabSize} /> : null}
            <Code text={line.text} tokens={lineTokens} marks={marks} />
          </span>
        )}
      </code>
    </div>
  )
}

// Screen column of a character, with tabs advancing to their next stop.
function column(text: string, index: number, tabSize: number): number {
  let col = 0
  for (let i = 0; i < index && i < text.length; i++) col = text[i] === '\t' ? col + tabSize - (col % tabSize) : col + 1
  return col
}

// The words a comment is on, drawn behind the text rather than splitting it, so a selection being made over
// the same text is never re-rendered away under the pointer.
function Pick({ text, range, tabSize }: { text: string; range: [number, number] | undefined; tabSize: number }) {
  if (!range) return null
  const from = column(text, range[0], tabSize)
  const to = column(text, range[1], tabSize)
  return (
    <span
      data-pick
      aria-hidden
      className="pointer-events-none absolute inset-y-0 -z-10 rounded-sm bg-tn-yellow/30 ring-1 ring-tn-yellow/50"
      style={{ left: `${from}ch`, width: `${to - from}ch` }}
    />
  )
}

// Memoized: scrolling re-renders the list every frame, but a row on screen rarely changes.
export const LineRow = memo(function LineRow({ item, row }: { item: NoteItem; row: DiffRow }) {
  const { expand, settings } = useRow()
  if (row.type === 'line') {
    const side = row.line.kind === 'deletion' ? 'deletions' : 'additions'
    return <Cell item={item} line={row.line} side={side} numbers="both" />
  }
  if (row.type === 'pair') {
    return (
      <div className="flex">
        <Cell item={item} line={row.left} side="deletions" numbers="one" />
        <span className="w-px shrink-0 bg-border" />
        <Cell item={item} line={row.right} side="additions" numbers="one" />
      </div>
    )
  }
  if (row.type === 'hunk') {
    if (settings.hunkSeparators === 'simple') return <div className="h-2 border-border border-y bg-card" />
    return (
      <div className="truncate bg-card px-3 py-1 text-tn-comment" title={row.header}>
        {settings.hunkSeparators === 'line-info-basic' ? '...' : row.header}
      </div>
    )
  }
  return (
    <div className="flex items-center bg-card px-1">
      <Button variant="secondary" size="sm" className="my-1" onClick={() => expand(item, row)}>
        <ChevronsUpDown />
        {`Show ${row.hidden} unchanged ${row.hidden === 1 ? 'line' : 'lines'}`}
      </Button>
    </div>
  )
})
