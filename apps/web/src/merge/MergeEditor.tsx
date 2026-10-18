import type { ConflictBlock, ConflictFile } from '@duck-diff/protocol'
import { Badge, type BadgeTone, Button, Separator, Textarea } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Check,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Pencil,
  RotateCcw,
  SquareArrowOutUpRight,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { CodeRowsSkeleton } from '../app/skeletons'
import { Code } from '../diff/Code'
import { highlighter } from '../diff/highlighter'
import { useGit } from '../git/GitProvider'
import { OperationActions } from '../git/OperationBanner'
import { useOpenFile } from '../hooks/useOpenFile'
import { useView } from '../hooks/useView'
import { dropKept, useKept } from '../lib/kept'
import { useStore } from '../lib/store'
import { fileGlyph } from '../sidebar/icons'
import { useStage } from '../state/stage'
import {
  blockLines,
  type Choice,
  type Choices,
  firstConflictLine,
  resultText,
  selectConflicts,
  unresolvedCount,
} from './merge-model'

const selectPath = (path: string | null) => path
// Long unchanged stretches between blocks fold to their edges, as a diff's context does.
const KEEP = 3
const MARKERS = /^(<{7}|>{7})( |$)/m

// Where each column's line numbers stand at the start of a segment.
interface Starts {
  ours: number
  result: number
  theirs: number
}

// How each pick reads and looks: its side's colour, or the result's own for a mix.
const PICKS: Record<Choice['kind'], { tone: BadgeTone; edge: string }> = {
  ours: { tone: 'soft-success', edge: 'border-tn-green' },
  theirs: { tone: 'soft-info', edge: 'border-tn-blue' },
  both: { tone: 'soft-done', edge: 'border-tn-magenta' },
  base: { tone: 'muted', edge: 'border-border' },
  edit: { tone: 'soft-done', edge: 'border-tn-magenta' },
}

function Lines({
  path,
  lines,
  start,
  tone = '',
}: {
  path: string
  lines: string[]
  start: number | null
  tone?: string
}) {
  useSyncExternalStore(highlighter.subscribe, () => highlighter.version)
  const text = lines.join('\n')
  const tokens = text ? highlighter.text(`merge:${path}:${text.length}:${text.slice(0, 64)}`, path, text) : null
  if (!lines.length)
    return <div className={`h-6 ps-[6ch] italic leading-6 text-muted-foreground ${tone}`}>(nothing)</div>
  return (
    <div className={tone}>
      {lines.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines of one fixed text
        <div key={index} className="flex min-h-6 leading-6">
          <span
            aria-hidden
            className="w-[6ch] shrink-0 select-none pe-[1.5ch] text-end text-muted-foreground/50 tabular-nums">
            {start === null ? '' : start + index}
          </span>
          <code data-code className="min-w-0 flex-1 whitespace-pre-wrap pe-3 [overflow-wrap:anywhere]">
            <Code text={line} tokens={tokens?.get(index + 1)} />
          </code>
        </div>
      ))}
    </div>
  )
}

function Common({ path, lines, starts }: { path: string; lines: string[]; starts: Starts }) {
  const [open, setOpen] = useState(false)
  const folded = !open && lines.length > KEEP * 2 + 1
  const column = (start: number, dim: boolean) => {
    const tone = dim ? 'opacity-60' : undefined
    if (!folded) return <Lines path={path} lines={lines} start={start} tone={tone} />
    return (
      <div>
        <Lines path={path} lines={lines.slice(0, KEEP)} start={start} tone={tone} />
        <Button
          variant="nothing"
          size="none"
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-6 w-full cursor-pointer items-center justify-start gap-2 whitespace-normal rounded-none bg-muted/40 ps-[1.5ch] text-muted-foreground hover:text-foreground">
          <ChevronsUpDown className="size-4" />
          {lines.length - KEEP * 2} unchanged lines
        </Button>
        <Lines path={path} lines={lines.slice(-KEEP)} start={start + lines.length - KEEP} tone={tone} />
      </div>
    )
  }
  return (
    <>
      {column(starts.ours, true)}
      {column(starts.result, false)}
      {column(starts.theirs, true)}
    </>
  )
}

// The strip over each column of one conflict; the three line up, so a block reads straight across.
const strip = (children: ReactNode, tone: string) => (
  <div className={`flex min-h-9 flex-wrap items-center gap-1 border-border border-y px-2 py-0.5 ${tone}`}>
    {children}
  </div>
)

function Block({
  path,
  block,
  number,
  starts,
  choice,
  onChoose,
}: {
  path: string
  block: ConflictBlock
  number: number
  starts: Starts
  choice: Choice | undefined
  onChoose(next: Choice | undefined): void
}) {
  const [editing, setEditing] = useKept<string | null>(`merge-block:${path}:${number}`, null)
  const chosen = blockLines(block, choice)
  // Once one side is taken, the other steps back.
  const dim = (side: 'ours' | 'theirs') =>
    choice && (choice.kind === 'ours' || choice.kind === 'theirs') && choice.kind !== side ? 'opacity-40' : ''
  const take = (side: 'ours' | 'theirs') => (
    <Button
      size="sm"
      variant="ghost"
      aria-pressed={choice?.kind === side}
      className={`${side === 'ours' ? 'ms-auto aria-pressed:text-tn-green' : 'aria-pressed:text-tn-blue'} aria-pressed:bg-accent`}
      onClick={() => onChoose({ kind: side })}>
      {side === 'theirs' ? choice?.kind === side ? <Check /> : <ArrowLeftToLine /> : null}
      {side === 'ours' ? 'Accept ours' : 'Accept theirs'}
      {side === 'ours' ? choice?.kind === side ? <Check /> : <ArrowRightToLine /> : null}
    </Button>
  )
  return (
    <>
      <section
        aria-label={`Ours, conflict ${number}`}
        data-conflict={number}
        className="row-span-2 grid min-w-0 grid-rows-subgrid">
        {strip(take('ours'), 'bg-tn-green/10')}
        <Lines
          path={path}
          lines={block.ours}
          start={starts.ours}
          tone={`border-s-2 border-tn-green bg-tn-green/10 ${dim('ours')}`}
        />
      </section>
      <section
        aria-label={`Result, conflict ${number}`}
        data-unresolved={choice ? undefined : true}
        className="row-span-2 grid min-w-0 grid-rows-subgrid">
        {strip(
          <>
            <span className="ps-1 text-muted-foreground tabular-nums" title={`Conflict ${number}`}>
              {number}
            </span>
            <Badge variant={choice ? PICKS[choice.kind].tone : 'soft-warning'} size="sm">
              {choice ? label(choice) : 'Needs a pick'}
            </Badge>
            <span className="ms-auto flex items-center gap-0.5">
              <Button size="sm" variant="ghost" onClick={() => onChoose({ kind: 'both', first: 'ours' })}>
                Both
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Both, theirs first"
                title="Both, theirs first"
                onClick={() => onChoose({ kind: 'both', first: 'theirs' })}>
                Theirs first
              </Button>
              {block.base ? (
                <Button size="sm" variant="ghost" onClick={() => onChoose({ kind: 'base' })}>
                  Base
                </Button>
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
          </>,
          'bg-muted/40',
        )}
        {editing !== null ? (
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
          <Lines path={path} lines={chosen} start={starts.result} tone={`border-s-2 ${PICKS[choice.kind].edge}`} />
        ) : (
          <p className="m-2 flex min-h-10 items-center justify-center rounded-md border border-warning/50 border-dashed bg-warning/5 px-3 text-center text-warning">
            Accept ours, theirs or both, or write it yourself.
          </p>
        )}
      </section>
      <section aria-label={`Theirs, conflict ${number}`} className="row-span-2 grid min-w-0 grid-rows-subgrid">
        {strip(take('theirs'), 'bg-tn-blue/10')}
        <Lines
          path={path}
          lines={block.theirs}
          start={starts.theirs}
          tone={`border-s-2 border-tn-blue bg-tn-blue/10 ${dim('theirs')}`}
        />
      </section>
    </>
  )
}

function label(choice: Choice): string {
  if (choice.kind === 'both') return choice.first === 'ours' ? 'Both' : 'Both, theirs first'
  if (choice.kind === 'edit') return 'Edited'
  return choice.kind === 'ours' ? 'Ours' : choice.kind === 'theirs' ? 'Theirs' : 'Base'
}

function Head({ name, detail, bar, tone }: { name: string; detail?: string; bar: string; tone: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
      <span aria-hidden className={`h-4 w-1 shrink-0 rounded-full ${bar}`} />
      <span className={tone}>{name}</span>
      {detail ? (
        <span className="truncate text-muted-foreground" title={detail}>
          {detail}
        </span>
      ) : null}
    </div>
  )
}

function Editor({ file, onDone }: { file: ConflictFile; onDone(): void }) {
  const { status, run, busy } = useGit()
  const openInEditor = useOpenFile()
  // Kept per file and conflict shape, so a reload keeps the picks and a new conflict in the file starts over.
  const keep = `merge:${file.path}:${file.segments.length}`
  const [choices, setChoices] = useKept<Choices>(`${keep}:choices`, {})
  // Editing the whole result as text replaces the blocks; markers left in it count as unresolved.
  const [whole, setWhole] = useKept<string | null>(`${keep}:whole`, null)
  const [at, setAt] = useState(0)
  const blocks = file.segments.flatMap((segment, index) => (segment.kind === 'conflict' ? [index] : []))
  const total = blocks.length
  const left = whole === null ? unresolvedCount(file, choices) : MARKERS.test(whole) ? 1 : 0
  const first = file.segments.find((segment) => segment.kind === 'conflict')
  const oursLabel = first?.kind === 'conflict' ? first.oursLabel : ''
  const theirsLabel = first?.kind === 'conflict' ? first.theirsLabel : ''
  const icon = fileGlyph(file.path.split('/').pop() ?? file.path)

  const choose = (index: number, next: Choice | undefined) =>
    setChoices((now) => {
      const copy = { ...now }
      if (next) copy[index] = next
      else delete copy[index]
      return copy
    })
  const all = (kind: 'ours' | 'theirs') => setChoices(Object.fromEntries(blocks.map((index) => [index, { kind }])))
  const save = async () => {
    const text = whole ?? resultText(file, choices)
    if (!(await run('resolve-text', { path: file.path, text }, `Resolved ${file.path}`))) return
    dropKept(`${keep}:choices`)
    dropKept(`${keep}:whole`)
    onDone()
  }
  const go = (to: number) => {
    const next = (to + total) % total
    setAt(next)
    document
      .querySelector(`[aria-label="Merge ${CSS.escape(file.path)}"] [data-conflict="${next + 1}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  // Forward goes to the next block still waiting for a pick, and round to the first once none are.
  const forward = () => {
    const waiting = blocks.map((index, number) => (choices[index] ? -1 : number)).filter((number) => number >= 0)
    go(waiting.find((number) => number > at) ?? waiting[0] ?? at + 1)
  }

  const starts: Starts = { ours: 1, result: 1, theirs: 1 }
  let number = 0
  return (
    <section aria-label={`Merge ${file.path}`} className="flex h-full min-h-0 flex-col">
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
              <IconTool label="Previous conflict" onClick={() => go(at - 1)} disabled={total < 2}>
                <ChevronUp />
              </IconTool>
              <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                Conflict {Math.min(at + 1, total)} of {total}
              </span>
              <IconTool label="Next conflict" onClick={forward} disabled={!total}>
                <ChevronDown />
              </IconTool>
              <Separator orientation="vertical" className="mx-1 h-5" />
              <Button size="sm" variant="ghost" onClick={() => all('ours')}>
                All ours
              </Button>
              <Button size="sm" variant="ghost" onClick={() => all('theirs')}>
                All theirs
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
      ) : (
        <>
          <div className="grid shrink-0 grid-cols-3 border-border border-b bg-card">
            <Head
              name="Ours"
              detail={oursLabel === 'HEAD' ? (status?.branch ?? 'HEAD') : oursLabel}
              bar="bg-tn-green"
              tone="text-tn-green"
            />
            <div className="border-border border-x">
              <Head name="Result" bar="bg-foreground/60" tone="text-foreground" />
            </div>
            <Head name="Theirs" detail={theirsLabel} bar="bg-tn-blue" tone="text-tn-blue" />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="grid grid-cols-3 [&>*:nth-child(3n+2)]:border-border [&>*:nth-child(3n+2)]:border-x">
              {file.segments.map((segment, index) => {
                const here = { ...starts }
                if (segment.kind === 'common') {
                  starts.ours += segment.lines.length
                  starts.result += segment.lines.length
                  starts.theirs += segment.lines.length
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments of one fixed file
                  return <Common key={index} path={file.path} lines={segment.lines} starts={here} />
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
                    onChoose={(next) => choose(index, next)}
                  />
                )
              })}
            </div>
          </div>
        </>
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

// Three panes per conflicted file: ours, the result being built, and theirs; each block takes a side,
// both, the base, or a hand edit, and Mark resolved writes the result and stages it.
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
