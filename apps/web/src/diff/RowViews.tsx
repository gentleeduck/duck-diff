import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { ChevronsUpDown, MessageSquarePlus, Minus, Plus, Undo2 } from 'lucide-react'
import { createContext, memo, useContext, useMemo } from 'react'
import type { NoteItem } from '../review/annotations'
import type { Settings } from '../state/settings'
import type { WriteKind } from '../viewer/actions'
import { Code } from './Code'
import type { Token } from './highlight'
import type { DiffLine, DiffRow } from './rows'
import { changedRanges } from './words'

export interface RowContextValue {
  settings: Settings
  tokens(item: NoteItem, side: 'old' | 'new', line: number): Token[] | undefined
  kinds(item: NoteItem): WriteKind[]
  comment(item: NoteItem, line: DiffLine, side: 'additions' | 'deletions'): void
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
  const { kinds, comment, write } = useRow()
  const writable = line.hunk >= 0 ? kinds(item) : []
  return (
    <span className="absolute inset-y-0 start-0 z-10 hidden items-center gap-0.5 bg-popover px-0.5 group-hover/line:flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Comment on line" onClick={() => comment(item, line, side)}>
            <MessageSquarePlus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Comment on line</TooltipContent>
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
  const { settings, tokens } = useRow()
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

  const tokenSide = line.kind === 'deletion' ? 'old' : 'new'
  const tokenLine = tokenSide === 'old' ? line.oldNo : line.newNo
  const wrap = settings.overflow === 'wrap'
  return (
    <div
      className={`group/line relative flex min-w-0 flex-1 ${settings.backgrounds ? BG[line.kind] : ''} ${MARK[line.kind]}`}>
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
        className={`min-w-0 flex-1 pe-4 ${wrap ? 'whitespace-pre-wrap break-all' : 'overflow-hidden whitespace-pre'}`}>
        <Code
          text={line.text}
          tokens={tokenLine === null ? undefined : tokens(item, tokenSide, tokenLine)}
          marks={marks}
        />
      </code>
    </div>
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
      <div className="flex items-center gap-2 bg-card px-3 py-1 text-tn-comment">
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
