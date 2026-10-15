import type { ConflictBlock, ConflictFile } from '@duck-diff/protocol'
import { Badge, Button, Skeleton, Textarea } from '@duck-diff/ui'
import { ArrowLeftToLine, ArrowRightToLine, Check, ChevronsUpDown, ExternalLink, Pencil, RotateCcw } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useApp } from '../app/AppProvider'
import { Code } from '../diff/Code'
import { highlighter } from '../diff/highlighter'
import { useGit } from '../git/GitProvider'
import { useCanOpen } from '../hooks/useCanOpen'
import { useView } from '../hooks/useView'
import { useStore } from '../lib/store'
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

function Lines({ path, lines, tone }: { path: string; lines: string[]; tone?: string }) {
  useSyncExternalStore(highlighter.subscribe, () => highlighter.version)
  const text = lines.join('\n')
  const tokens = text ? highlighter.text(`merge:${path}:${text.length}:${text.slice(0, 64)}`, path, text) : null
  if (!lines.length) return <div className={`h-6 px-3 italic text-muted-foreground ${tone ?? ''}`}>(nothing)</div>
  return (
    <div className={tone}>
      {lines.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines of one fixed text
        <div key={index} className="min-h-6 whitespace-pre-wrap px-3 leading-6 [overflow-wrap:anywhere]">
          <code data-code>
            <Code text={line} tokens={tokens?.get(index + 1)} />
          </code>
        </div>
      ))}
    </div>
  )
}

function Common({ path, lines }: { path: string; lines: string[] }) {
  const [open, setOpen] = useState(false)
  const folded = !open && lines.length > KEEP * 2 + 1
  const cell = (shown: string[], dim: boolean) => (
    <Lines path={path} lines={shown} tone={dim ? 'opacity-60' : undefined} />
  )
  if (!folded)
    return (
      <>
        {cell(lines, true)}
        {cell(lines, false)}
        {cell(lines, true)}
      </>
    )
  const head = lines.slice(0, KEEP)
  const tail = lines.slice(-KEEP)
  const expand = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex h-6 w-full cursor-pointer items-center gap-2 bg-muted/40 px-3 text-muted-foreground hover:text-foreground">
      <ChevronsUpDown className="size-4" />
      {lines.length - KEEP * 2} unchanged lines
    </button>
  )
  const side = (dim: boolean) => (
    <div>
      {cell(head, dim)}
      {expand}
      {cell(tail, dim)}
    </div>
  )
  return (
    <>
      {side(true)}
      {side(false)}
      {side(true)}
    </>
  )
}

function Block({
  path,
  block,
  number,
  choice,
  onChoose,
}: {
  path: string
  block: ConflictBlock
  number: number
  choice: Choice | undefined
  onChoose(next: Choice | undefined): void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const chosen = blockLines(block, choice)
  const heading = (children: ReactNode, tone: string) => (
    <div className={`flex min-h-8 flex-wrap items-center gap-1 border-border border-y px-2 py-0.5 ${tone}`}>
      {children}
    </div>
  )
  return (
    <>
      <section aria-label={`Ours, conflict ${number}`} className="row-span-2 grid min-w-0 grid-rows-subgrid">
        {heading(
          <Button size="sm" variant="ghost" onClick={() => onChoose({ kind: 'ours' })}>
            <ArrowRightToLine />
            Accept ours
          </Button>,
          'bg-tn-green/10',
        )}
        <Lines path={path} lines={block.ours} tone="bg-tn-green/10" />
      </section>
      <section
        aria-label={`Result, conflict ${number}`}
        data-unresolved={choice ? undefined : true}
        className="row-span-2 grid min-w-0 grid-rows-subgrid">
        {heading(
          <>
            <span className={`basis-full truncate ps-1 ${choice ? 'text-tn-green' : 'text-warning'}`}>
              {choice ? `Conflict ${number}: ${label(choice)}` : `Conflict ${number}`}
            </span>
            <Button size="sm" variant="ghost" onClick={() => onChoose({ kind: 'both', first: 'ours' })}>
              Both
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onChoose({ kind: 'both', first: 'theirs' })}>
              Both, theirs first
            </Button>
            {block.base ? (
              <Button size="sm" variant="ghost" onClick={() => onChoose({ kind: 'base' })}>
                Base
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Edit conflict ${number}`}
              onClick={() => setEditing((chosen ?? [...block.ours, ...block.theirs]).join('\n'))}>
              <Pencil />
            </Button>
            {choice ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Reset conflict ${number}`}
                onClick={() => onChoose(undefined)}>
                <RotateCcw />
              </Button>
            ) : null}
          </>,
          'bg-muted/40',
        )}
        {editing !== null ? (
          <div className="flex flex-col gap-1 p-2">
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
        ) : chosen ? (
          <Lines path={path} lines={chosen} />
        ) : (
          <p className="flex h-12 items-center justify-center bg-warning/10 text-muted-foreground">
            Pick a side, both, or edit the text.
          </p>
        )}
      </section>
      <section aria-label={`Theirs, conflict ${number}`} className="row-span-2 grid min-w-0 grid-rows-subgrid">
        {heading(
          <Button size="sm" variant="ghost" onClick={() => onChoose({ kind: 'theirs' })}>
            <ArrowLeftToLine />
            Accept theirs
          </Button>,
          'bg-tn-blue/10',
        )}
        <Lines path={path} lines={block.theirs} tone="bg-tn-blue/10" />
      </section>
    </>
  )
}

function label(choice: Choice): string {
  if (choice.kind === 'both') return choice.first === 'ours' ? 'both' : 'both, theirs first'
  if (choice.kind === 'edit') return 'edited'
  return choice.kind
}

function Editor({ file, onDone }: { file: ConflictFile; onDone(): void }) {
  const { api } = useApp()
  const { run, busy } = useGit()
  const canOpen = useCanOpen()
  const [choices, setChoices] = useState<Choices>({})
  // Editing the whole result as text replaces the blocks; markers left in it count as unresolved.
  const [whole, setWhole] = useState<string | null>(null)
  const left = whole === null ? unresolvedCount(file, choices) : MARKERS.test(whole) ? 1 : 0
  const total = file.segments.filter((segment) => segment.kind === 'conflict').length
  const ours = file.segments.find((segment) => segment.kind === 'conflict')
  const choose = (index: number, next: Choice | undefined) =>
    setChoices((now) => {
      const copy = { ...now }
      if (next) copy[index] = next
      else delete copy[index]
      return copy
    })
  const all = (kind: 'ours' | 'theirs') =>
    setChoices(
      Object.fromEntries(
        file.segments.flatMap((segment, index) => (segment.kind === 'conflict' ? [[index, { kind }]] : [])),
      ),
    )
  const save = async () => {
    const text = whole ?? resultText(file, choices)
    if (await run('resolve-text', { path: file.path, text }, `Resolved ${file.path}`)) onDone()
  }
  const next = () =>
    document.querySelector('[data-unresolved]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  let number = 0
  return (
    <section aria-label={`Merge ${file.path}`} className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-border border-b bg-card px-3">
        <span className="min-w-0 truncate" title={file.path}>
          {file.path}
        </span>
        <Badge variant={left ? 'outline' : 'default'} size="sm">
          {left ? `${whole === null ? left : 'Markers'} of ${total} left` : 'All resolved'}
        </Badge>
        <div className="ms-auto flex items-center gap-1">
          {whole === null ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => all('ours')}>
                All ours
              </Button>
              <Button size="sm" variant="ghost" onClick={() => all('theirs')}>
                All theirs
              </Button>
              <Button size="sm" variant="ghost" disabled={!left} onClick={next}>
                Next conflict
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
          {canOpen ? (
            <Button
              size="sm"
              variant="ghost"
              title="Open the file in Neovim at the first conflict left"
              onClick={() => void api.open(file.path, firstConflictLine(file, {}) ?? 1)}>
              <ExternalLink />
              Neovim
            </Button>
          ) : null}
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
          <div className="grid shrink-0 grid-cols-3 border-border border-b text-muted-foreground">
            <span className="truncate px-3 py-1 text-tn-green">
              Ours {ours?.kind === 'conflict' ? ours.oursLabel : ''}
            </span>
            <span className="border-border border-x px-3 py-1">Result</span>
            <span className="truncate px-3 py-1 text-tn-blue">
              Theirs {ours?.kind === 'conflict' ? ours.theirsLabel : ''}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="grid grid-cols-3 [&>*:nth-child(3n+2)]:border-border [&>*:nth-child(3n+2)]:border-x">
              {file.segments.map((segment, index) => {
                if (segment.kind === 'common')
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments of one fixed file
                  return <Common key={index} path={file.path} lines={segment.lines} />
                number++
                return (
                  <Block
                    // biome-ignore lint/suspicious/noArrayIndexKey: segments of one fixed file
                    key={index}
                    path={file.path}
                    block={segment}
                    number={number}
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

// Three panes per conflicted file: ours, the result being built, and theirs; each block takes a side,
// both, the base, or a hand edit, and Mark resolved writes the result and stages it.
export default function MergeEditor() {
  const app = useApp()
  const { api, mergeFile, stage } = app
  const { show } = useView()
  const path = useStore(mergeFile, selectPath)
  const conflictKey = useStore(stage, selectConflicts)
  const [file, setFile] = useState<ConflictFile | null | undefined>(undefined)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => stage.load(), [stage])
  const shown = path ?? conflictKey.split('\n')[0] ?? null

  useEffect(() => {
    setFile(undefined)
    setFailed(null)
    if (!shown) return
    let alive = true
    api.conflict(shown).then(
      (next) => alive && setFile(next),
      (error: Error) => alive && setFailed(error.message),
    )
    return () => {
      alive = false
    }
  }, [api, shown])

  const after = useMemo(
    () => () => {
      const rest = conflictKey.split('\n').filter((other) => other && other !== shown)
      if (rest[0]) mergeFile.set(rest[0])
      else {
        mergeFile.set(null)
        show('changes')
      }
    },
    [conflictKey, shown, mergeFile, show],
  )

  if (!shown)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>No conflicts left to resolve.</p>
        <Button size="sm" variant="outline" onClick={() => show('changes')}>
          Back to changes
        </Button>
      </div>
    )
  if (failed) return <p className="p-4 text-removed">{failed}</p>
  if (!file) return <Skeleton className="m-4 h-40" />
  return <Editor key={file.path} file={file} onDone={after} />
}
