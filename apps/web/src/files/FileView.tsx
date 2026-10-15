import type { BlameLine, FileContents } from '@duck-diff/protocol'
import { Badge, Button } from '@duck-diff/ui'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Check, Code2, Copy, Eye, FileDiff, History, SquareArrowOutUpRight, UserSearch } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { Code } from '../diff/Code'
import { highlighter } from '../diff/highlighter'
import { useCodeScrollX } from '../diff/useCodeScrollX'
import { useCanOpen } from '../hooks/useCanOpen'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { useStore } from '../lib/store'
import { Markdown } from '../markdown/Markdown'
import { fileGlyph } from '../sidebar/icons'
import { relativeTime } from '../sidebar/relative-time'
import type { SessionState } from '../state/session'
import type { Settings } from '../state/settings'
import { formatBytes } from '../viewer/file-info'

const selectPath = (path: string | null) => path
const selectFiles = (state: SessionState) => state.files
const selectSettings = (state: Settings) => state
const MARKDOWN = /\.(md|markdown)$/i

// A README's relative link, resolved against the file it sits in, as a repo path.
function resolveLink(from: string, href: string): string {
  return decodeURIComponent(new URL(href, `http://repo/${from}`).pathname.slice(1))
}

// The first line of each run from one commit names it; the rest of the run stays quiet.
function BlameCell({ blame, index }: { blame: BlameLine[] | null; index: number }) {
  const { graphSelection } = useApp()
  const { show } = useView()
  const line = blame?.[index]
  const first = line && blame?.[index - 1]?.sha !== line.sha
  if (!line) return <span className="w-60 shrink-0 border-border border-e" />
  return (
    <button
      type="button"
      title={`${line.summary}\n${line.author}, ${new Date(line.time * 1000).toLocaleString()}`}
      onClick={() => {
        graphSelection.set(line.sha)
        show('graph')
      }}
      className="flex w-60 shrink-0 cursor-pointer gap-2 border-border border-e px-2 text-start text-muted-foreground hover:bg-accent/60">
      {first ? (
        <>
          <span className="min-w-0 flex-1 truncate">{line.author}</span>
          <span className="shrink-0 text-tn-comment">{relativeTime(line.time)}</span>
        </>
      ) : null}
    </button>
  )
}

export default function FileView() {
  const { api, fileSelection, fileHistory } = useApp()
  const path = useStore(fileSelection, selectPath)
  const changed = useSession(selectFiles)
  const settings = useSettings(selectSettings)
  const { navigate } = useTarget()
  const { show } = useView()
  const [contents, setContents] = useState<FileContents | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const canOpen = useCanOpen()
  const [preview, setPreview] = useState(true)
  const [blaming, setBlaming] = useState(false)
  const [blame, setBlame] = useState<BlameLine[] | null>(null)
  useSyncExternalStore(highlighter.subscribe, () => highlighter.version)

  useEffect(() => {
    if (!path) return
    let alive = true
    setContents(null)
    setFailed(null)
    api.file(path).then(
      (next) => alive && setContents(next),
      (error: Error) => alive && setFailed(error.message),
    )
    return () => {
      alive = false
    }
  }, [api, path])

  // Read once per file while blame is on; untracked files have none and show a plain gutter.
  useEffect(() => {
    setBlame(null)
    if (!path || !blaming) return
    let alive = true
    api.blame(path).then(
      (next) => alive && setBlame(next),
      () => alive && setBlame([]),
    )
    return () => {
      alive = false
    }
  }, [api, path, blaming])

  const lines = useMemo(() => (contents?.text ?? '').replace(/\n$/, '').split('\n'), [contents])
  const tokens =
    path && contents?.text
      ? highlighter.text(`file:${path}:${contents.size}:${contents.text.length}`, path, contents.text)
      : null
  const lineHeight = Math.round(settings.fontSize * 1.5)
  const scroller = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: contents?.text ? lines.length : 0,
    getScrollElement: () => scroller.current,
    estimateSize: () => lineHeight,
    overscan: 30,
  })
  const widest = useMemo(
    () =>
      new Map([
        [
          'file',
          lines.reduce(
            (max, line) => Math.max(max, line.length + (line.split('\t').length - 1) * (settings.tabSize - 1)),
            0,
          ),
        ],
      ]),
    [lines, settings.tabSize],
  )
  const sideways = useCodeScrollX(scroller, widest, true)

  if (!path) {
    return <p className="p-4 text-muted-foreground">Pick a file on the left to read it here.</p>
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
      <header className="flex h-11 shrink-0 items-center gap-2 border-border border-b bg-card px-3">
        <span style={{ color: icon.color }}>{icon.glyph}</span>
        <span className="min-w-0 truncate" title={path}>
          {path}
        </span>
        {contents ? <span className="shrink-0 text-muted-foreground">{formatBytes(contents.size)}</span> : null}
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
      {contents && contents.text === null ? (
        <p className="p-4 text-muted-foreground">
          {contents.binary ? 'Binary file, not shown.' : `Too large to show (${formatBytes(contents.size)}).`}
        </p>
      ) : null}
      {contents?.text && markdown && preview ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <article className="mx-auto max-w-4xl p-6">
            <Markdown text={contents.text} onLocalLink={(href) => fileSelection.set(resolveLink(path, href))} />
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
                className="absolute inset-x-0 flex hover:bg-accent/40"
                data-scroll-key="file"
                style={{
                  ...sideways.rowProps('file').style,
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
          {sideways.scrollbar}
        </div>
      ) : null}
    </section>
  )
}
