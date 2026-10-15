import type { BlameLine } from '@duck-diff/protocol'
import { Badge, Button } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Check, Code2, Copy, Eye, FileDiff, History, SquareArrowOutUpRight, UserSearch } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { CodeRowsSkeleton } from '../app/skeletons'
import { BlameCell } from '../blame/BlameCell'
import { CodeHover } from '../code-nav/CodeHover'
import { useSymbolClick } from '../code-nav/useSymbolClick'
import { Code } from '../diff/Code'
import { highlighter } from '../diff/highlighter'
import { useCodeScrollX } from '../diff/useCodeScrollX'
import { useCanOpen } from '../hooks/useCanOpen'
import { rememberedTop, useScrollMemory } from '../hooks/useScrollMemory'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { useStore } from '../lib/store'
import { Markdown } from '../markdown/Markdown'
import { fileGlyph } from '../sidebar/icons'
import type { SessionState } from '../state/session'
import type { Settings } from '../state/settings'
import { formatBytes } from '../viewer/file-info'
import { openFile } from './open-file'

const selectPath = (path: string | null) => path
const selectFiles = (state: SessionState) => state.files
const selectSettings = (state: Settings) => state
const MARKDOWN = /\.(md|markdown)$/i
const NO_BLAME: BlameLine[] = []

// A repository image as the page loads it, at the revision the file is shown at.
function rawUrl(path: string, at: string | null): string {
  const params = new URLSearchParams({ path })
  if (at) params.set('ref', at)
  return `/api/raw?${params}`
}

// A README's relative link, resolved against the file it sits in, as a repo path.
function resolveLink(from: string, href: string): string {
  return decodeURIComponent(new URL(href, `http://repo/${from}`).pathname.slice(1))
}

const selectAt = (at: string | null) => at
const selectLine = (line: number | null) => line

export default function FileView() {
  const app = useApp()
  const { api, fileSelection, fileHistory, fileLine, fileAt, queries } = app
  const path = useStore(fileSelection, selectPath)
  const at = useStore(fileAt, selectAt)
  const line = useStore(fileLine, selectLine)
  const changed = useSession(selectFiles)
  const settings = useSettings(selectSettings)
  const { navigate } = useTarget()
  const { show } = useView()
  const [copied, setCopied] = useState(false)
  const canOpen = useCanOpen()
  const [preview, setPreview] = useState(true)
  const [blaming, setBlaming] = useState(false)
  const file = useQuery({ ...queries.git.file(path ?? '', at ?? undefined), enabled: Boolean(path) })
  const contents = file.data ?? null
  const failed = file.error ? file.error.message : null
  // Read once per file while blame is on; untracked files have none and show a plain gutter.
  const blamed = useQuery({ ...queries.git.blame(path ?? '', at ?? undefined), enabled: Boolean(path) && blaming })
  const blame = blaming ? (blamed.data ?? (blamed.isError ? NO_BLAME : null)) : null
  useSyncExternalStore(highlighter.subscribe, () => highlighter.version)

  const lines = useMemo(() => (contents?.text ?? '').replace(/\n$/, '').split('\n'), [contents])
  const tokens =
    path && contents?.text
      ? highlighter.text(`file:${at ?? ''}:${path}:${contents.size}:${contents.text.length}`, path, contents.text)
      : null
  const lineHeight = Math.round(settings.fontSize * 1.5)
  const fileRoot = useCallback(() => scroller.current, [])
  // A line jump is its own place; plain opens come back to where the file was left.
  const scrollKey = `file:${at ?? ''}:${path}:${line ?? ''}`
  const scroller = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: contents?.text ? lines.length : 0,
    initialOffset: () => rememberedTop(path ? scrollKey : null),
    getScrollElement: () => scroller.current,
    estimateSize: () => lineHeight,
    overscan: 30,
  })
  const widest = useMemo(
    () =>
      new Map([
        [
          `file:${path}`,
          lines.reduce(
            (max, line) => Math.max(max, line.length + (line.split('\t').length - 1) * (settings.tabSize - 1)),
            0,
          ),
        ],
      ]),
    [lines, settings.tabSize, path],
  )
  const sideways = useCodeScrollX(scroller, widest, true)
  useScrollMemory(scroller, path && contents?.text ? scrollKey : null)
  const locateSymbol = useCallback(() => ({ ref: at, path }), [at, path])
  useSymbolClick(fileRoot, locateSymbol)
  // Opening at a line (a definition, a use) centres it once the text is in.
  useEffect(() => {
    if (line && contents?.text) requestAnimationFrame(() => virtualizer.scrollToIndex(line - 1, { align: 'center' }))
  }, [line, contents, virtualizer])

  if (!path) {
    return <p className="p-4 text-muted-foreground">Pick a file on the left to read it here. No file, no quack.</p>
  }

  const status = changed.find((file) => file.path === path)
  const markdown = MARKDOWN.test(path)
  const icon = fileGlyph(path.split('/').pop() ?? path)
  const copy = async () => {
    await navigator.clipboard.writeText(path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <section aria-label={path} className="flex h-full flex-col">
      <CodeHover root={fileRoot} locate={locateSymbol} />
      <header className="flex h-11 shrink-0 items-center gap-2 border-border border-b bg-card px-3">
        <span style={{ color: icon.color }}>{icon.glyph}</span>
        <span className="min-w-20 shrink truncate" title={path}>
          {path}
        </span>
        {contents ? (
          <span className="hidden shrink-0 text-muted-foreground xl:inline">{formatBytes(contents.size)}</span>
        ) : null}
        {at ? (
          <>
            <Badge variant="outline" size="sm" className="shrink-0 text-tn-blue">
              at {/^[0-9a-f]{40}$/.test(at) ? at.slice(0, 7) : at}
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => openFile(app, path)}>
              Working tree
            </Button>
          </>
        ) : null}
        {status ? (
          <Badge variant="outline" size="sm" className="border-warning/40 bg-warning/15 text-warning">
            Changed
          </Badge>
        ) : null}
        <span className="ms-auto flex items-center gap-1.5">
          {status ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigate({ kind: 'local' })
                show('changes')
              }}>
              <FileDiff />
              Show changes
            </Button>
          ) : null}
          {canOpen ? (
            <Button size="sm" variant="outline" aria-label="Open in Neovim" onClick={() => void api.open(path, 1)}>
              <SquareArrowOutUpRight />
              Open
            </Button>
          ) : null}
          <IconTool
            label={blaming ? 'Hide blame' : 'Blame: who changed each line'}
            onClick={() => {
              // Blame reads against lines, so a rendered Markdown file shows its source while it is on.
              if (!blaming) setPreview(false)
              setBlaming(!blaming)
            }}>
            <UserSearch />
          </IconTool>
          <IconTool
            label="File history"
            onClick={() => {
              fileHistory.set(path)
              show('changes')
            }}>
            <History />
          </IconTool>
          {markdown ? (
            <IconTool label={preview ? 'Show source' : 'Show preview'} onClick={() => setPreview(!preview)}>
              {preview ? <Code2 /> : <Eye />}
            </IconTool>
          ) : null}
          <IconTool label={copied ? 'Copied' : 'Copy path'} onClick={copy}>
            {copied ? <Check /> : <Copy />}
          </IconTool>
        </span>
      </header>
      {failed ? (
        <p className="p-4 text-removed">
          Could not read {path}: {failed}
        </p>
      ) : null}
      {!contents && !failed ? <CodeRowsSkeleton count={30} /> : null}
      {contents?.text === '' ? <p className="p-4 text-muted-foreground">This file is empty.</p> : null}
      {contents && contents.text === null ? (
        <p className="p-4 text-muted-foreground">
          {contents.binary ? 'Binary file, not shown.' : `Too large to show (${formatBytes(contents.size)}).`}
        </p>
      ) : null}
      {contents?.text && markdown && preview ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <article className="w-full p-6">
            <Markdown
              text={contents.text}
              onLocalLink={(href) => openFile(app, resolveLink(path, href))}
              imageUrl={(src) => rawUrl(resolveLink(path, src), at)}
            />
          </article>
        </div>
      ) : null}
      {contents?.text !== null && contents && !(markdown && preview) ? (
        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-auto"
          style={{ fontSize: settings.fontSize, lineHeight: `${lineHeight}px`, tabSize: settings.tabSize }}>
          {sideways.probe}
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtual) => (
              <div
                key={virtual.index}
                className={`absolute inset-x-0 flex hover:bg-accent/40 ${virtual.index + 1 === line ? 'bg-tn-yellow/15' : ''}`}
                data-scroll-key={`file:${path}`}
                data-line={virtual.index + 1}
                style={{
                  ...sideways.rowStyle(`file:${path}`),
                  height: lineHeight,
                  transform: `translateY(${virtual.start}px)`,
                }}>
                {blaming ? <BlameCell blame={blame} index={virtual.index} /> : null}
                <span className="w-14 shrink-0 select-none pe-3 text-end text-tn-gutter tabular-nums">
                  {virtual.index + 1}
                </span>
                <code data-code className="min-w-0 flex-1 overflow-hidden whitespace-pre pe-4">
                  <span className="inline-block translate-x-[calc(var(--code-x,0px)*-1)]">
                    <Code text={lines[virtual.index] ?? ''} tokens={tokens?.get(virtual.index + 1)} />
                  </span>
                </code>
              </div>
            ))}
          </div>
          <div className="pointer-events-none sticky bottom-0 z-10 h-0">
            {sideways.bar(`file:${path}`, undefined, 'pointer-events-auto absolute inset-x-0 bottom-0')}
          </div>
        </div>
      ) : null}
    </section>
  )
}
