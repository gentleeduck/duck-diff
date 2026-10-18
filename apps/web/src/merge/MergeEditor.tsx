import type { ConflictBlock, ConflictFile } from '@duck-diff/protocol'
import { Badge, type BadgeTone, Button, Separator, Textarea } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownUp,
  ArrowLeftToLine,
  ArrowRightToLine,
  Check,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Columns3,
  GitCommitVertical,
  Pencil,
  RotateCcw,
  Rows3,
  SquareArrowOutUpRight,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { CodeRowsSkeleton } from '../app/skeletons'
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
import { contextLines, MergeLines } from './MergeLines'
import {
  blockLines,
  type Choice,
  type Choices,
  firstConflictLine,
  MERGE_STEP,
  resultText,
  selectConflicts,
  sideDiff,
  unresolvedCount,
} from './merge-model'

const selectPath = (path: string | null) => path
const selectSplit = (state: Settings) => state.diffStyle === 'split'
// Long unchanged stretches between blocks fold to their edges, as a diff's context does.
const KEEP = 3
const MARKERS = /^(<{7}|>{7})( |$)/m

type Side = 'ours' | 'theirs'
type Sides = ConflictFile['sides']

// The two sides as GitHub names them, each with a colour of its own; the changes inside are red and green.
const SIDE = {
  ours: {
    label: 'Current change',
    accept: 'Accept current',
    bar: 'bg-tn-blue',
    text: 'text-tn-blue',
    tint: 'bg-tn-blue/10',
  },
  theirs: {
    label: 'Incoming change',
    accept: 'Accept incoming',
    bar: 'bg-tn-magenta',
    text: 'text-tn-magenta',
    tint: 'bg-tn-magenta/10',
  },
} as const

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

function Common({ path, lines, starts, split }: { path: string; lines: string[]; starts: Starts; split: boolean }) {
  const [open, setOpen] = useState(false)
  const folded = !open && lines.length > KEEP * 2 + 1
  const column = (start: number, dim: boolean) => {
    const body = folded ? (
      <>
        <MergeLines path={path} lines={contextLines(lines.slice(0, KEEP), start)} />
        <Button
          variant="nothing"
          size="none"
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-6 w-full cursor-pointer items-center justify-start gap-2 whitespace-normal rounded-none bg-muted/40 ps-[1.5ch] text-muted-foreground hover:text-foreground">
          <ChevronsUpDown className="size-4" />
          {lines.length - KEEP * 2} unchanged lines
        </Button>
        <MergeLines path={path} lines={contextLines(lines.slice(-KEEP), start + lines.length - KEEP)} />
      </>
    ) : (
      <MergeLines path={path} lines={contextLines(lines, start)} />
    )
    return <div className={`min-w-0 ${dim ? 'opacity-60' : ''}`}>{body}</div>
  }
  if (!split) return column(starts.result, false)
  return (
    <>
      {column(starts.ours, true)}
      {column(starts.result, false)}
      {column(starts.theirs, true)}
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
  onChoose,
}: {
  path: string
  block: ConflictBlock
  number: number
  starts: Starts
  choice: Choice | undefined
  sides: Sides
  split: boolean
  onChoose(next: Choice | undefined): void
}) {
  const [editing, setEditing] = useKept<string | null>(`merge-block:${path}:${number}`, null)
  const chosen = blockLines(block, choice)
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
        <MergeLines path={path} lines={contextLines(chosen, starts.result)} />
      </div>
    ) : (
      <p className="m-2 flex min-h-10 items-center justify-center rounded-md border border-warning/50 border-dashed bg-warning/5 px-3 text-center text-warning">
        Accept current, incoming or both, or write it yourself.
      </p>
    )
  const ours = <MergeLines path={path} lines={sideDiff(block.base, block.ours, starts.ours)} dim={dim('ours')} />
  const theirs = (
    <MergeLines path={path} lines={sideDiff(block.base, block.theirs, starts.theirs)} dim={dim('theirs')} />
  )

  if (split)
    return (
      <>
        <section
          aria-label={`Current change, conflict ${number}`}
          data-conflict={number}
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
    <section aria-label={`Conflict ${number}`} data-conflict={number} className="my-2 border-border border-y">
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

function Editor({ file, onDone }: { file: ConflictFile; onDone(): void }) {
  const { settings } = useApp()
  const { run, busy } = useGit()
  const split = useSettings(selectSplit)
  const openInEditor = useOpenFile()
  // Kept per file and conflict shape, so a reload keeps the picks and a new conflict in the file starts over.
  const keep = `merge:${file.path}:${file.segments.length}`
  const [choices, setChoices] = useKept<Choices>(`${keep}:choices`, {})
  // Editing the whole result as text replaces the blocks; markers left in it count as unresolved.
  const [whole, setWhole] = useKept<string | null>(`${keep}:whole`, null)
  const [at, setAt] = useState(0)
  const page = useRef<HTMLElement>(null)
  const blocks = file.segments.flatMap((segment, index) => (segment.kind === 'conflict' ? [index] : []))
  const total = blocks.length
  const left = whole === null ? unresolvedCount(file, choices) : MARKERS.test(whole) ? 1 : 0
  const first = file.segments.find((segment) => segment.kind === 'conflict')
  const icon = fileGlyph(file.path.split('/').pop() ?? file.path)

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
  const go = (to: number) => {
    if (!total) return
    const next = (to + total) % total
    setAt(next)
    page.current
      ?.querySelector(`[data-conflict="${next + 1}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  // Forward goes to the next block still waiting for a pick, and round to the first once none are.
  const forward = () => {
    const waiting = blocks.map((index, number) => (choices[index] ? -1 : number)).filter((number) => number >= 0)
    go(waiting.find((number) => number > at) ?? waiting[0] ?? at + 1)
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

  const starts: Starts = { ours: 1, result: 1, theirs: 1 }
  let number = 0
  const segments = file.segments.map((segment, index) => {
    const here = { ...starts }
    if (segment.kind === 'common') {
      starts.ours += segment.lines.length
      starts.result += segment.lines.length
      starts.theirs += segment.lines.length
      // biome-ignore lint/suspicious/noArrayIndexKey: segments of one fixed file
      return <Common key={index} path={file.path} lines={segment.lines} starts={here} split={split} />
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
        onChoose={(next) => choose(index, next)}
      />
    )
  })

  return (
    <section ref={page} aria-label={`Merge ${file.path}`} className="flex h-full min-h-0 flex-col">
      {/* On a narrow page the actions take a second row rather than pushing the path or Mark resolved away. */}
      <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-border border-b bg-card px-3 py-1.5">
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
              <Separator orientation="vertical" className="mx-1 h-5" />
              <Button size="sm" variant="ghost" onClick={() => all('ours')}>
                All current
              </Button>
              <Button size="sm" variant="ghost" onClick={() => all('theirs')}>
                All incoming
              </Button>
              <Separator orientation="vertical" className="mx-1 h-5" />
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
            label={split ? 'Stacked layout' : 'Split layout'}
            tip={split ? 'Stacked layout (t)' : 'Split layout (t)'}
            onClick={() =>
              settings.set((prev) => ({ ...prev, diffStyle: prev.diffStyle === 'split' ? 'unified' : 'split' }))
            }>
            {split ? <Rows3 /> : <Columns3 />}
          </IconTool>
          <Button
            size="sm"
            variant="ghost"
            title="Open the file at the first conflict left"
            onClick={() => void openInEditor(file.path, firstConflictLine(file, {}) ?? 1)}>
            <SquareArrowOutUpRight />
            Open
          </Button>
          <Button size="sm" disabled={left > 0} loading={busy === 'resolve-text'} onClick={() => void save()}>
            <Check />
            Mark resolved
          </Button>
        </div>
      </header>
      {whole !== null ? (
        <div className="min-h-0 flex-1 p-3">
          <Textarea
            aria-label="Result"
            value={whole}
            onChange={(event) => setWhole(event.target.value)}
            className="h-full resize-none font-[inherit]"
          />
        </div>
      ) : split ? (
        <>
          <div className="grid shrink-0 grid-cols-3 border-border border-b bg-card [&>*]:px-3 [&>*]:py-1.5">
            <SideName side="ours" sides={file.sides} fallback={first?.kind === 'conflict' ? first.oursLabel : ''} />
            <div className="border-border border-x">
              <ResultName sides={file.sides} />
            </div>
            <SideName side="theirs" sides={file.sides} fallback={first?.kind === 'conflict' ? first.theirsLabel : ''} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="grid grid-cols-3 [&>*:nth-child(3n+2)]:border-border [&>*:nth-child(3n+2)]:border-x">
              {segments}
            </div>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">{segments}</div>
      )}
    </section>
  )
}

function Finished() {
  const { status } = useGit()
  const { show } = useView()
  const operation = status?.operation
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

// Each conflicted file as GitHub shows a conflict: the current change and the incoming one, each against the
// merge base, and the result being built, side by side or stacked as the diff settings say. A block takes a
// side, both, the base, or a hand edit, and Mark resolved writes the result and stages it.
export default function MergeEditor() {
  const app = useApp()
  const { mergeFile, queries } = app
  const path = useStore(mergeFile, selectPath)
  const conflictKey = selectConflicts(useStage())
  // A file just resolved can stay in the list until the index is read again; it is not opened twice.
  const resolved = useRef(new Set<string>())
  const open = conflictKey.split('\n').filter((other) => other && !resolved.current.has(other))
  const shown = path && !resolved.current.has(path) ? path : (open[0] ?? null)
  const conflict = useQuery({ ...queries.git.conflict(shown ?? ''), enabled: Boolean(shown) })
  const file = conflict.data
  const failed = conflict.error ? conflict.error.message : null

  useEffect(() => {
    const now = new Set(conflictKey.split('\n'))
    for (const done of resolved.current) if (!now.has(done)) resolved.current.delete(done)
  }, [conflictKey])
  const after = () => {
    if (shown) resolved.current.add(shown)
    mergeFile.set(open.find((other) => other !== shown) ?? null)
  }

  if (!shown) return <Finished />
  if (failed) return <p className="p-4 text-removed">{failed}</p>
  if (!file) return <CodeRowsSkeleton count={20} />
  return <Editor key={file.path} file={file} onDone={after} />
}
