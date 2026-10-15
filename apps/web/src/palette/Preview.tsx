import type { FileContents } from '@duck-diff/protocol'
import { Badge } from '@duck-diff/ui'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useApp } from '../app/AppProvider'
import { Code } from '../diff/Code'
import { highlighter } from '../diff/highlighter'
import { Body } from '../github/Conversation'
import { IssueIcon } from '../github/IssuesList'
import type { IndexedItem } from '../github/item-index'
import { Labels } from '../github/Labels'
import { PullIcon } from '../github/PullsList'
import { ago } from '../github/time'
import { fileGlyph } from '../sidebar/icons'

export type PreviewTarget = { kind: 'file'; path: string } | { kind: 'item'; item: IndexedItem } | null

const LINES = 80
// Read once per palette session; moving up and down the results should not refetch.
const files = new Map<string, Promise<FileContents | null>>()
const bodies = new Map<number, Promise<string | null>>()

function FilePreview({ path }: { path: string }) {
  const { api } = useApp()
  const [contents, setContents] = useState<FileContents | null | undefined>(undefined)
  useSyncExternalStore(highlighter.subscribe, () => highlighter.version)
  useEffect(() => {
    let alive = true
    setContents(undefined)
    // A short pause so racing down the list does not read every file on the way.
    const timer = setTimeout(() => {
      let read = files.get(path)
      if (!read) {
        read = api.file(path).catch(() => null)
        files.set(path, read)
      }
      void read.then((next) => alive && setContents(next))
    }, 90)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [api, path])
  const icon = fileGlyph(path.split('/').pop() ?? path)
  const text = contents?.text ?? null
  const shown = text ? text.split('\n').slice(0, LINES).join('\n') : null
  const tokens = shown ? highlighter.text(`preview:${path}:${contents?.size}`, path, shown) : null
  return (
    <div className="flex h-full flex-col">
      <p className="flex shrink-0 items-center gap-1.5 border-border border-b px-3 py-2 text-foreground" title={path}>
        <span style={{ color: icon.color }}>{icon.glyph}</span>
        <span className="min-w-0 truncate">{path}</span>
      </p>
      {contents === undefined ? <p className="p-3 text-muted-foreground">Reading...</p> : null}
      {contents === null || (contents && text === null) ? (
        <p className="p-3 text-muted-foreground">{contents?.binary ? 'Binary file.' : 'Nothing to show.'}</p>
      ) : null}
      {shown ? (
        <pre className="min-h-0 flex-1 overflow-hidden px-3 py-2 text-[0.9em] leading-snug">
          {shown.split('\n').map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines of one fixed text
            <div key={index} className="flex whitespace-pre">
              <span className="w-8 shrink-0 select-none pe-2 text-end text-tn-gutter">{index + 1}</span>
              <code>
                <Code text={line} tokens={tokens?.get(index + 1)} />
              </code>
            </div>
          ))}
        </pre>
      ) : null}
    </div>
  )
}

function ItemPreview({ item }: { item: IndexedItem }) {
  const { api } = useApp()
  const [body, setBody] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    setBody(undefined)
    const timer = setTimeout(() => {
      let read = bodies.get(item.number)
      if (!read) {
        read = api.github.issue(item.number).then(
          (found) => found.body,
          () => null,
        )
        bodies.set(item.number, read)
      }
      void read.then((next) => alive && setBody(next))
    }, 120)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [api, item.number])
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <p className="flex items-start gap-2">
        <span className="pt-0.5">
          {item.kind === 'pr' ? <PullIcon pull={item} /> : <IssueIcon state={item.state} />}
        </span>
        <span className="min-w-0 font-bold text-foreground">
          {item.title} <span className="font-normal text-muted-foreground">#{item.number}</span>
        </span>
      </p>
      <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
        <Badge variant="outline" size="sm">
          {item.merged ? 'Merged' : item.draft ? 'Draft' : item.state === 'open' ? 'Open' : 'Closed'}
        </Badge>
        {item.author} · updated {ago(item.updatedAt)}
      </p>
      {item.labels.length ? (
        <div className="flex flex-wrap gap-1">
          <Labels labels={item.labels} />
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-hidden border-border border-t pt-2">
        {body === undefined ? <p className="text-muted-foreground">Reading...</p> : null}
        {body === null ? <p className="text-muted-foreground">Could not read it.</p> : null}
        {body !== undefined && body !== null ? <Body text={body} /> : null}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-popover" />
      </div>
    </div>
  )
}

// The right half of the palette: what the highlighted result is, before going there.
export function Preview({ target }: { target: PreviewTarget }) {
  if (!target) return <p className="p-3 text-muted-foreground">Move through the results to preview them here.</p>
  return target.kind === 'file' ? <FilePreview path={target.path} /> : <ItemPreview item={target.item} />
}
