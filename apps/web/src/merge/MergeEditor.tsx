import type { ConflictBlame, ConflictBlock, ConflictFile } from '@duck-diff/protocol'
import { Badge, type BadgeTone, Button, Textarea } from '@duck-diff/ui'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  ArrowDownUp,
  ArrowLeftToLine,
  ArrowRightToLine,
  Check,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  GitCommitVertical,
  History,
  Pencil,
  RotateCcw,
  SquareArrowOutUpRight,
  UserRound,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { CodeRowsSkeleton } from '../app/skeletons'
import { useCodeScrollX } from '../diff/useCodeScrollX'
import { useGit } from '../git/GitProvider'
import { OperationActions } from '../git/OperationBanner'
import { useOpenFile } from '../hooks/useOpenFile'
import { useSettings } from '../hooks/useSettings'
import { useView } from '../hooks/useView'
import { dropKept, useKept } from '../lib/kept'
import { useStore } from '../lib/store'
import { fileGlyph } from '../sidebar/icons'
import type { Settings } from '../state/settings'
import { useStage } from '../state/stage'
import { MergeHistory } from './MergeHistory'
import { contextLines, MergeLines, ScrollRows } from './MergeLines'
import {
  blockLines,
  type Choice,
  type Choices,
  eitherBlame,
  firstConflictLine,
  MERGE_BLAME,
  MERGE_STEP,
  pickedBlame,
  resultText,
  type SegmentBlame,
  segmentBlames,
  selectConflicts,
  sideDiff,
  sideLineBlame,
  unresolvedCount,
} from './merge-model'
import { SIDE, type Side } from './sides'

const selectPath = (path: string | null) => path
const selectSplit = (state: Settings) => state.diffStyle === 'split'
const selectWrap = (state: Settings) => state.overflow === 'wrap'
const selectTabSize = (state: Settings) => state.tabSize
// Long unchanged stretches between blocks fold to their edges, as a diff's context does.
const KEEP = 3
const MARKERS = /^(<{7}|>{7})( |$)/m
// Every line unknown while the blame is read, so the columns keep their place.
const NO_BLAME: ConflictBlame = { ours: null, theirs: null, base: null }

type Sides = ConflictFile['sides']
type Column = 'ours' | 'result' | 'theirs' | 'stacked'
// The sideways scroll a column of a file moves with.
const columnKey = (path: string, column: Column) => `${column}:${path}`

// How each pick reads in the result: the side's own colour, or a neutral one for a mix or a hand edit.
const PICKS: Record<Choice['kind'], { tone: BadgeTone; edge: string }> = {
  ours: { tone: 'soft-info', edge: 'border-tn-blue' },
  theirs: { tone: 'soft-done', edge: 'border-tn-magenta' },
  both: { tone: 'muted', edge: 'border-foreground/40' },
  base: { tone: 'muted', edge: 'border-foreground/40' },
  edit: { tone: 'muted', edge: 'border-tn-yellow' },
}

function label(choice: Choice): string {
  if (choice.kind === 'both') return choice.first === 'ours' ? 'Both' : 'Both, incoming first'
  if (choice.kind === 'edit') return 'Edited'
  return choice.kind === 'ours' ? 'Current' : choice.kind === 'theirs' ? 'Incoming' : 'Base'
}

// Where each column's line numbers stand at the start of a segment.
interface Starts {
  ours: number
  result: number
  theirs: number
}

// A side's name, the branch or commit, its short hash and subject, as GitHub heads a change.
function SideName({ side, sides, fallback }: { side: Side; sides: Sides; fallback: string }) {
  const look = SIDE[side]
  const info = sides[side]
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden className={`h-4 w-1 shrink-0 rounded-full ${look.bar}`} />
      <span className={`shrink-0 ${look.text}`}>{look.label}</span>
      <span className="shrink-0 text-foreground">{info?.name ?? fallback}</span>
      {info ? <code className="shrink-0 text-muted-foreground">{info.sha}</code> : null}
      {info?.subject ? (
        <span className="min-w-0 truncate text-muted-foreground" title={info.subject}>
          {info.subject}
        </span>
      ) : null}
    </span>
  )
}

function ResultName({ sides }: { sides: Sides }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden className="h-4 w-1 shrink-0 rounded-full bg-foreground/50" />
      <span className="shrink-0 text-foreground">Result</span>
      {sides.base ? (
        <span className="min-w-0 truncate text-muted-foreground" title={`Merge base: ${sides.base.subject}`}>
          from merge base <code>{sides.base.sha}</code>
        </span>
      ) : null}
    </span>
  )
}

function Common({
  path,
  lines,
  starts,
  split,
  blame,
}: {
  path: string
  lines: string[]
  starts: Starts
  split: boolean
  blame: SegmentBlame | undefined
}) {
  const [open, setOpen] = useState(false)
  const folded = !open && lines.length > KEEP * 2 + 1
  const column = (start: number, which: Column, dim: boolean) => {
    const key = columnKey(path, which)
    const who = blame && (which === 'ours' ? blame.ours : which === 'theirs' ? blame.theirs : eitherBlame(blame))
    const body = folded ? (
      <>
        <MergeLines
          path={path}
          column={key}
          lines={contextLines(lines.slice(0, KEEP), start)}
          blame={who?.slice(0, KEEP)}
        />
        <Button
          variant="nothing"
          size="none"
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-6 w-full cursor-pointer items-center justify-start gap-2 whitespace-normal rounded-none bg-muted/40 ps-[1.5ch] text-muted-foreground hover:text-foreground">
          <ChevronsUpDown className="size-4" />
          {lines.length - KEEP * 2} unchanged lines
        </Button>
        <MergeLines
          path={path}
          column={key}
          lines={contextLines(lines.slice(-KEEP), start + lines.length - KEEP)}
          blame={who?.slice(-KEEP)}
        />
      </>
    ) : (
      <MergeLines path={path} column={key} lines={contextLines(lines, start)} blame={who} />
    )
    return <div className={`min-w-0 ${dim ? 'opacity-60' : ''}`}>{body}</div>
  }
  if (!split) return column(starts.result, 'stacked', false)
  return (
    <>
      {column(starts.ours, 'ours', true)}
      {column(starts.result, 'result', false)}
      {column(starts.theirs, 'theirs', true)}
    </>
  )
}

// The strip over one part of a conflict; in the split layout the three line up, so a block reads across.
const strip = (children: ReactNode, tone: string) => (
  <div className={`flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 border-border border-y px-2 py-0.5 ${tone}`}>
    {children}
  </div>
)

function Block({
  path,
  block,
  number,
  starts,
  choice,
  sides,
  split,
  blame,
  onChoose,
}: {
  path: string
  block: ConflictBlock
  number: number
  starts: Starts
  choice: Choice | undefined
  sides: Sides
  split: boolean
  blame: SegmentBlame | undefined
  onChoose(next: Choice | undefined): void
}) {
  const [editing, setEditing] = useKept<string | null>(`merge-block:${path}:${number}`, null)
  const chosen = blockLines(block, choice)
  const key = (column: Column) => columnKey(path, split ? column : 'stacked')
  // Once one side is taken, the other steps back.
  const dim = (side: Side) => choice?.kind === (side === 'ours' ? 'theirs' : 'ours')
  const take = (side: Side) => (
    <Button
      size="sm"
      variant="ghost"
      aria-pressed={choice?.kind === side}
      className={`${side === 'ours' && split ? 'ms-auto' : ''} ${
        side === 'ours' ? 'aria-pressed:text-tn-blue' : 'aria-pressed:text-tn-magenta'
      } aria-pressed:bg-accent`}
      onClick={() => onChoose({ kind: side })}>
      {split && side === 'theirs' ? choice?.kind === side ? <Check /> : <ArrowLeftToLine /> : null}
      {SIDE[side].accept}
      {split && side === 'ours' ? choice?.kind === side ? <Check /> : <ArrowRightToLine /> : null}
      {!split && choice?.kind === side ? <Check /> : null}
    </Button>
  )
  const status = (
    <>
      <span className="ps-1 text-muted-foreground tabular-nums" title={`Conflict ${number}`}>
        {split ? number : `Conflict ${number}`}
      </span>
      <Badge variant={choice ? PICKS[choice.kind].tone : 'soft-warning'} size="sm">
        {choice ? label(choice) : 'Needs a pick'}
      </Badge>
    </>
  )
  // Both reads as a word; the rarer picks are icons with their names on hover, so the strip stays one line.
  const mix = (
    <span className="ms-auto flex items-center gap-0.5">
      <Button size="sm" variant="ghost" onClick={() => onChoose({ kind: 'both', first: 'ours' })}>
        Both
      </Button>
      <IconTool label="Both, incoming first" onClick={() => onChoose({ kind: 'both', first: 'theirs' })}>
        <ArrowDownUp />
      </IconTool>
      {block.base ? (
        <IconTool
          label="Take the merge base"
          tip="The merge base: as it was before both"
          onClick={() => onChoose({ kind: 'base' })}>
          <GitCommitVertical />
        </IconTool>
      ) : null}
      <IconTool
        label={`Edit conflict ${number}`}
        tip="Write it yourself"
        onClick={() => setEditing((chosen ?? [...block.ours, ...block.theirs]).join('\n'))}>
        <Pencil />
      </IconTool>
      {choice ? (
        <IconTool label={`Reset conflict ${number}`} tip="Pick again" onClick={() => onChoose(undefined)}>
          <RotateCcw />
        </IconTool>
      ) : null}
    </span>
  )
  const result =
    editing !== null ? (
      <div className="flex flex-col gap-2 p-2">
        <Textarea
          aria-label={`Text for conflict ${number}`}
          value={editing}
          rows={Math.min(16, Math.max(3, editing.split('\n').length + 1))}
          onChange={(event) => setEditing(event.target.value)}
          className="font-[inherit]"
        />
        <div className="flex gap-1">
          <Button
            size="sm"
            onClick={() => {
              onChoose({ kind: 'edit', lines: editing === '' ? [] : editing.split('\n') })
              setEditing(null)
            }}>
            <Check />
            Use this text
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </div>
    ) : chosen && choice ? (
      <div className={`border-s-2 ${PICKS[choice.kind].edge}`}>
        <MergeLines
          path={path}
          column={key('result')}
          lines={contextLines(chosen, starts.result)}
          blame={blame && pickedBlame(choice, blame)}
        />
      </div>
    ) : (
      <p className="m-2 flex min-h-10 items-center justify-center rounded-md border border-warning/50 border-dashed bg-warning/5 px-3 text-center text-warning">
        Accept current, incoming or both, or write it yourself.
      </p>
    )
  const side = (which: Side) => {
    const lines = sideDiff(block.base, block[which], starts[which])
    return (
      <MergeLines
        path={path}
        column={key(which)}
        lines={lines}
        dim={dim(which)}
        blame={blame && sideLineBlame(lines, blame[which], blame.base)}
      />
    )
  }
  const ours = side('ours')
  const theirs = side('theirs')

  if (split)
    return (
      <>
        <section
          aria-label={`Current change, conflict ${number}`}
          data-conflict
          className="row-span-2 grid min-w-0 grid-rows-subgrid">
          {strip(take('ours'), SIDE.ours.tint)}
          {ours}
        </section>
        <section
          aria-label={`Result, conflict ${number}`}
          data-unresolved={choice ? undefined : true}
          className="row-span-2 grid min-w-0 grid-rows-subgrid">
          {strip(
            <>
              {status}
              {mix}
            </>,
            'bg-muted/40',
          )}
          {result}
        </section>
        <section
          aria-label={`Incoming change, conflict ${number}`}
          className="row-span-2 grid min-w-0 grid-rows-subgrid">
          {strip(take('theirs'), SIDE.theirs.tint)}
          {theirs}
        </section>
      </>
    )

  // Stacked: current over incoming over the result, each headed by what it is.
  return (
    <section aria-label={`Conflict ${number}`} data-conflict className="my-2 border-border border-y">
      {strip(status, 'bg-muted/40')}
      <section aria-label={`Current change, conflict ${number}`}>
        {strip(
          <>
            <SideName side="ours" sides={sides} fallback={block.oursLabel} />
            <span className="ms-auto">{take('ours')}</span>
          </>,
          SIDE.ours.tint,
        )}
        {ours}
      </section>
      <section aria-label={`Incoming change, conflict ${number}`}>
        {strip(
          <>
            <SideName side="theirs" sides={sides} fallback={block.theirsLabel} />
            <span className="ms-auto">{take('theirs')}</span>
          </>,
          SIDE.theirs.tint,
        )}
        {theirs}
      </section>
      <section aria-label={`Result, conflict ${number}`} data-unresolved={choice ? undefined : true}>
        {strip(
          <>
            <ResultName sides={sides} />
            {mix}
          </>,
          'bg-muted/40',
        )}
        {result}
      </section>
    </section>
  )
}

// One conflicted file on the page, as the diff shows a file: a header that stays while its blocks scroll by,
// with the file's own picks, and a sideways bar per column along its bottom.
function FileSection({
  file,
  split,
  wrap,
  bar,
  onDone,
}: {
  file: ConflictFile
  split: boolean
  wrap: boolean
  bar(key: string): ReactNode
  onDone(): void
}) {
  const { queries, mergeTop } = useApp()
  const { run, busy } = useGit()
  const openInEditor = useOpenFile()
  // Kept per file and conflict shape, so a reload keeps the picks and a new conflict in the file starts over.
  const keep = `merge:${file.path}:${file.segments.length}`
  const [choices, setChoices] = useKept<Choices>(`${keep}:choices`, {})
  // Editing the whole result as text replaces the blocks; markers left in it count as unresolved.
  const [whole, setWhole] = useKept<string | null>(`${keep}:whole`, null)
  const blocks = file.segments.flatMap((segment, index) => (segment.kind === 'conflict' ? [index] : []))
  const total = blocks.length
  const left = whole === null ? unresolvedCount(file, choices) : MARKERS.test(whole) ? 1 : 0
  const icon = fileGlyph(file.path.split('/').pop() ?? file.path)
  const [history, setHistory] = useKept(`merge-history:${file.path}`, false)
  const [blaming, setBlaming] = useKept(`merge-blame:${file.path}`, false)
  const blamed = useQuery({ ...queries.git.conflictBlame(file.path), enabled: blaming })
  const blames = useMemo(
    () => (blaming ? segmentBlames(file, blamed.data ?? NO_BLAME) : undefined),
    [blaming, blamed.data, file],
  )

  // b blames the file at the top of the page.
  useEffect(() => {
    const onBlame = () => {
      if (mergeTop.get() === file.path) setBlaming((on) => !on)
    }
    window.addEventListener(MERGE_BLAME, onBlame)
    return () => window.removeEventListener(MERGE_BLAME, onBlame)
  }, [mergeTop, file.path, setBlaming])

  const choose = (index: number, next: Choice | undefined) =>
    setChoices((now) => {
      const copy = { ...now }
      if (next) copy[index] = next
      else delete copy[index]
      return copy
    })
  const all = (kind: Side) => setChoices(Object.fromEntries(blocks.map((index) => [index, { kind }])))
  const save = async () => {
    const text = whole ?? resultText(file, choices)
    if (!(await run('resolve-text', { path: file.path, text }, `Resolved ${file.path}`))) return
    dropKept(`${keep}:choices`)
    dropKept(`${keep}:whole`)
    onDone()
  }

  const starts: Starts = { ours: 1, result: 1, theirs: 1 }
  let number = 0
  const segments = file.segments.map((segment, index) => {
    const here = { ...starts }
    if (segment.kind === 'common') {
      starts.ours += segment.lines.length
      starts.result += segment.lines.length
      starts.theirs += segment.lines.length
      return (
        <Common
          // biome-ignore lint/suspicious/noArrayIndexKey: segments of one fixed file
          key={index}
          path={file.path}
          lines={segment.lines}
          starts={here}
          split={split}
          blame={blames?.[index]}
        />
      )
    }
    number++
    starts.ours += segment.ours.length
    starts.theirs += segment.theirs.length
    // The result counts what has been picked; a block still open adds nothing yet.
    starts.result += blockLines(segment, choices[index])?.length ?? 0
    return (
      <Block
        // biome-ignore lint/suspicious/noArrayIndexKey: segments of one fixed file
        key={index}
        path={file.path}
        block={segment}
        number={number}
        starts={here}
        choice={choices[index]}
        sides={file.sides}
        split={split}
        blame={blames?.[index]}
        onChoose={(next) => choose(index, next)}
      />
    )
  })

  return (
    <section aria-label={`Merge ${file.path}`} data-merge-file={file.path} className="border-border border-b">
      <header
        className={`sticky z-20 flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 border-border border-b bg-card px-3 py-1.5 ${
          split ? 'top-9' : 'top-0'
        }`}>
        <div className="flex min-w-48 flex-1 items-center gap-2">
          <span style={{ color: icon.color }}>{icon.glyph}</span>
          <span className="min-w-0 truncate" title={file.path}>
            {file.path}
          </span>
          <Badge variant={left ? 'soft-warning' : 'soft-success'} size="sm" className="shrink-0">
            {left ? `${whole === null ? left : 'Markers'} of ${total} left` : 'All resolved'}
          </Badge>
        </div>
        <div className="ms-auto flex flex-wrap items-center justify-end gap-1">
          {whole === null ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => all('ours')}>
                All current
              </Button>
              <Button size="sm" variant="ghost" onClick={() => all('theirs')}>
                All incoming
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setWhole(resultText(file, choices))}>
                <Pencil />
                Edit as text
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setWhole(null)}>
              Back to blocks
            </Button>
          )}
          <IconTool
            label="Open"
            tip="Open in your editor at the first conflict left"
            onClick={() => void openInEditor(file.path, firstConflictLine(file, {}) ?? 1)}>
            <SquareArrowOutUpRight />
          </IconTool>
          <span className={blaming ? 'text-tn-blue' : ''}>
            <IconTool
              label={blaming ? 'Hide blame' : 'Blame: who changed each line'}
              tip={`${blaming ? 'Hide blame' : 'Blame: who changed each line'} (b)`}
              onClick={() => setBlaming((on) => !on)}>
              <UserRound />
            </IconTool>
          </span>
          <span className={history ? 'text-tn-blue' : ''}>
            <IconTool
              label={history ? 'Hide history' : "History: each side's commits to the file"}
              onClick={() => setHistory((open) => !open)}>
              <History />
            </IconTool>
          </span>
          <Button size="sm" disabled={left > 0} loading={busy === 'resolve-text'} onClick={() => void save()}>
            <Check />
            Mark resolved
          </Button>
        </div>
      </header>
      {history ? <MergeHistory file={file} split={split} /> : null}
      {whole !== null ? (
        <div className="p-3">
          <Textarea
            aria-label={`Result for ${file.path}`}
            value={whole}
            rows={Math.min(40, Math.max(8, whole.split('\n').length + 1))}
            onChange={(event) => setWhole(event.target.value)}
            className="resize-y font-[inherit]"
          />
        </div>
      ) : split ? (
        <>
          <div className="grid grid-cols-3 [&>*:nth-child(3n+2)]:border-border [&>*:nth-child(3n+2)]:border-x">
            {segments}
          </div>
          {wrap ? null : (
            <div className="sticky bottom-0 z-10 grid grid-cols-3 [&>*]:min-w-0">
              {bar(columnKey(file.path, 'ours'))}
              {bar(columnKey(file.path, 'result'))}
              {bar(columnKey(file.path, 'theirs'))}
            </div>
          )}
        </>
      ) : (
        <>
          {segments}
          {wrap ? null : <div className="sticky bottom-0 z-10">{bar(columnKey(file.path, 'stacked'))}</div>}
        </>
      )}
    </section>
  )
}

// Each column's longest line, in characters, sets how far it can scroll sideways.
function widestColumns(files: ConflictFile[], tabSize: number): Map<string, number> {
  const width = (line: string) => line.length + (line.split('\t').length - 1) * (tabSize - 1)
  const widest = new Map<string, number>()
  const grow = (key: string, lines: readonly string[]) => {
    for (const line of lines) widest.set(key, Math.max(widest.get(key) ?? 0, width(line)))
  }
  for (const file of files) {
    for (const segment of file.segments) {
      const sides =
        segment.kind === 'common'
          ? { ours: segment.lines, theirs: segment.lines, base: [] }
          : { ours: segment.ours, theirs: segment.theirs, base: segment.base ?? [] }
      grow(columnKey(file.path, 'ours'), [...sides.ours, ...sides.base])
      grow(columnKey(file.path, 'theirs'), [...sides.theirs, ...sides.base])
      grow(columnKey(file.path, 'result'), [...sides.ours, ...sides.theirs])
      grow(columnKey(file.path, 'stacked'), [...sides.ours, ...sides.theirs, ...sides.base])
    }
  }
  return widest
}

function Finished() {
  const { status } = useGit()
  const { show } = useView()
  const { toolId } = useApp()
  const operation = status?.operation
  if (toolId)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-tn-green">Every conflict is resolved.</p>
        <p className="text-muted-foreground">git takes it from here, in the terminal.</p>
      </div>
    )
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <p className="text-tn-green">{operation ? 'Every conflict is resolved.' : 'No conflicts to resolve.'}</p>
      {operation ? (
        <>
          <p className="max-w-md text-muted-foreground">Continue makes the {operation} commit and finishes it.</p>
          <OperationActions resolve={false} />
        </>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => show('changes')}>
        Back to changes
      </Button>
    </div>
  )
}

// Every conflicted file on one page, as the diff shows changed files: each conflict as GitHub shows it, the
// current change and the incoming one against their merge base beside the result being built, side by side or
// stacked as the diff settings say. A block takes a side, both, the base, or a hand edit; Mark resolved writes a
// file's result and stages it, and the file leaves the page.
export default function MergeEditor() {
  const app = useApp()
  const { mergeFile, mergeTop, queries } = app
  const split = useSettings(selectSplit)
  const wrap = useSettings(selectWrap)
  const tabSize = useSettings(selectTabSize)
  const target = useStore(mergeFile, selectPath)
  const stage = useStage()
  const conflictKey = selectConflicts(stage)
  // A file just resolved can stay in the list until the index is read again; it is not shown twice.
  const [resolved, setResolved] = useState<ReadonlySet<string>>(new Set())
  const listed = conflictKey.split('\n').filter(Boolean)
  // A link to one file opens it before the index has been read.
  const early = target && !stage.loaded && !listed.includes(target) ? [target] : []
  const paths = [...early, ...listed].filter((path) => !resolved.has(path))
  const reads = useQueries({ queries: paths.map((path) => queries.git.conflict(path)) })
  const files = reads.flatMap((read) => (read.data ? [read.data] : []))
  const loading = reads.some((read) => read.isPending)
  const failed = reads.find((read) => read.error)?.error?.message ?? null
  const page = useRef<HTMLDivElement>(null)
  const widest = useMemo(() => widestColumns(files, tabSize), [files, tabSize])
  const sideways = useCodeScrollX(page, widest, !wrap)
  const [at, setAt] = useState(0)
  const first = files[0]?.segments.find((segment) => segment.kind === 'conflict')

  useEffect(() => {
    const now = new Set(conflictKey.split('\n'))
    setResolved((before) => {
      const kept = new Set([...before].filter((path) => now.has(path)))
      return kept.size === before.size ? before : kept
    })
  }, [conflictKey])

  // Picking a file in the list (or opening the page at one) scrolls to it, as the diff does.
  useEffect(() => {
    if (!target || loading) return
    page.current
      ?.querySelector(`[data-merge-file="${CSS.escape(target)}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [target, loading])

  // The file list marks the file whose blocks are on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the page mounts once the files are read, so it waits for them
  useEffect(() => {
    const root = page.current
    if (!root) return
    const onScroll = () => {
      const top = root.getBoundingClientRect().top + 48
      const sections = [...root.querySelectorAll<HTMLElement>('[data-merge-file]')]
      const current = sections.filter((section) => section.getBoundingClientRect().top <= top).at(-1) ?? sections[0]
      mergeTop.set(current?.dataset.mergeFile ?? null)
    }
    onScroll()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [mergeTop, files.length])

  // Through every conflict on the page in order; forward goes to the next one still waiting for a pick.
  const conflicts = () => [...(page.current?.querySelectorAll<HTMLElement>('[data-conflict]') ?? [])]
  const total = files.reduce((sum, file) => sum + file.segments.filter((s) => s.kind === 'conflict').length, 0)
  const go = (to: number) => {
    const all = conflicts()
    if (!all.length) return
    const next = (to + all.length) % all.length
    setAt(next)
    all[next]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  // Split, a block's result is the column beside it; stacked, it sits inside the block.
  const open = (block: HTMLElement) =>
    split
      ? Boolean(block.nextElementSibling?.hasAttribute('data-unresolved'))
      : Boolean(block.querySelector('[data-unresolved]'))
  const forward = () => {
    const all = conflicts()
    const waiting = all.flatMap((block, index) => (open(block) ? [index] : []))
    go(waiting.find((index) => index > at) ?? waiting[0] ?? at + 1)
  }
  const step = useRef({ go, forward, at })
  step.current = { go, forward, at }
  useEffect(() => {
    const onStep = (event: Event) => {
      const { go, forward, at } = step.current
      if ((event as CustomEvent<number>).detail > 0) forward()
      else go(at - 1)
    }
    window.addEventListener(MERGE_STEP, onStep)
    return () => window.removeEventListener(MERGE_STEP, onStep)
  }, [])

  if (!paths.length) return <Finished />
  if (failed && !files.length) return <p className="p-4 text-removed">{failed}</p>
  if (!files.length) return <CodeRowsSkeleton count={20} />
  return (
    <ScrollRows.Provider value={sideways.rowStyle}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-border border-b bg-card px-3 py-1">
          <span className="text-muted-foreground">
            {files.length} {files.length === 1 ? 'file' : 'files'}, {total} {total === 1 ? 'conflict' : 'conflicts'}
          </span>
          <div className="ms-auto flex items-center gap-1">
            <IconTool
              label="Previous conflict"
              tip="Previous conflict (k)"
              onClick={() => go(at - 1)}
              disabled={total < 2}>
              <ChevronUp />
            </IconTool>
            <span className="whitespace-nowrap text-muted-foreground tabular-nums">
              Conflict {Math.min(at + 1, total)} of {total}
            </span>
            <IconTool label="Next conflict" tip="Next conflict (j)" onClick={forward} disabled={!total}>
              <ChevronDown />
            </IconTool>
          </div>
        </div>
        <div ref={page} className="relative min-h-0 flex-1 overflow-auto">
          {sideways.probe}
          {split && files[0] ? (
            <div className="sticky top-0 z-30 grid h-9 grid-cols-3 items-center border-border border-b bg-card [&>*]:px-3">
              <SideName
                side="ours"
                sides={files[0].sides}
                fallback={first?.kind === 'conflict' ? first.oursLabel : ''}
              />
              <div className="flex h-full items-center border-border border-x">
                <ResultName sides={files[0].sides} />
              </div>
              <SideName
                side="theirs"
                sides={files[0].sides}
                fallback={first?.kind === 'conflict' ? first.theirsLabel : ''}
              />
            </div>
          ) : null}
          {files.map((file) => (
            <FileSection
              key={file.path}
              file={file}
              split={split}
              wrap={wrap}
              bar={(key) => sideways.bar(key)}
              onDone={() => {
                setResolved((before) => new Set(before).add(file.path))
                if (mergeFile.get() === file.path) mergeFile.set(null)
              }}
            />
          ))}
          {loading ? <CodeRowsSkeleton count={6} /> : null}
        </div>
      </div>
    </ScrollRows.Provider>
  )
}
