import type { FileContents } from '@duck-diff/protocol'
import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Check, Copy, FileDiff, History, SquareArrowOutUpRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useApp } from '../app/AppProvider'
import { Code } from '../diff/Code'
import { highlighter } from '../diff/highlighter'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { useStore } from '../lib/store'
import { fileGlyph } from '../sidebar/icons'
import type { SessionState } from '../state/session'
import type { Settings } from '../state/settings'
import { formatBytes } from '../viewer/file-info'

const selectPath = (path: string | null) => path
const selectFiles = (state: SessionState) => state.files
const selectSettings = (state: Settings) => state

function Tool({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
  const [canOpen, setCanOpen] = useState(false)
  useSyncExternalStore(highlighter.subscribe, () => highlighter.version)

  useEffect(() => {
    api.repo().then(
      (info) => setCanOpen(info.nvim),
      () => {},
    )
  }, [api])

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

  if (!path) {
    return <p className="p-4 text-muted-foreground">Pick a file on the left to read it here.</p>
  }

  const status = changed.find((file) => file.path === path)
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
          <Tool
            label="File history"
            onClick={() => {
              fileHistory.set(path)
              show('changes')
            }}>
            <History />
          </Tool>
          <Tool label={copied ? 'Copied' : 'Copy path'} onClick={copy}>
            {copied ? <Check /> : <Copy />}
          </Tool>
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
      {contents?.text !== null && contents ? (
        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-auto"
          style={{ fontSize: settings.fontSize, lineHeight: `${lineHeight}px`, tabSize: settings.tabSize }}>
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtual) => (
              <div
                key={virtual.index}
                className="absolute inset-x-0 flex hover:bg-accent/40"
                style={{ height: lineHeight, transform: `translateY(${virtual.start}px)` }}>
                <span className="w-14 shrink-0 select-none pe-3 text-end text-tn-gutter tabular-nums">
                  {virtual.index + 1}
                </span>
                <code className="min-w-0 flex-1 whitespace-pre pe-4">
                  <Code text={lines[virtual.index] ?? ''} tokens={tokens?.get(virtual.index + 1)} />
                </code>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
