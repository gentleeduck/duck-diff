import { Badge, type BadgeTone } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { useApp } from '../app/AppProvider'
import { CodeRowsSkeleton, LinesSkeleton } from '../app/skeletons'
import { Code } from '../diff/Code'
import { highlighter } from '../diff/highlighter'
import { Body } from '../github/Conversation'
import { IssueIcon } from '../github/IssuesList'
import type { IndexedItem } from '../github/item-index'
import { Labels } from '../github/Labels'
import { PullIcon } from '../github/PullsList'
import { ago } from '../github/time'
import { useSettings } from '../hooks/useSettings'
import { useSettled } from '../hooks/useSettled'
import { fileGlyph } from '../sidebar/icons'
import type { Settings } from '../state/settings'

export type PreviewTarget = { kind: 'file'; path: string } | { kind: 'item'; item: IndexedItem } | null

const LINES = 80
const selectSize = (settings: Settings) => settings.fontSize
const selectTab = (settings: Settings) => settings.tabSize
// Read once per palette session; moving up and down the results should not refetch.

function FilePreview({ path }: { path: string }) {
  const { queries } = useApp()
  // Cached files show at once; others wait until the selection stops moving.
  const file = useQuery({ ...queries.git.file(path), enabled: useSettled(path, 90) === path })
  const contents = file.isError ? null : file.data
  useSyncExternalStore(highlighter.subscribe, () => highlighter.version)
  const code = { size: useSettings(selectSize), tab: useSettings(selectTab) }
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
      {contents === undefined ? <CodeRowsSkeleton count={16} /> : null}
      {contents === null || (contents && text === null) ? (
        <p className="p-3 text-muted-foreground">{contents?.binary ? 'Binary file.' : 'Nothing to show.'}</p>
      ) : null}
      {shown ? (
        <pre
          className="min-h-0 flex-1 overflow-hidden px-3 py-2"
          // The code size and line height the diff and file views use, so a preview reads the same.
          style={{ fontSize: code.size, lineHeight: `${Math.round(code.size * 1.5)}px`, tabSize: code.tab }}>
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

// As StatePill colours it: open green, merged or a done issue purple, a closed pull request red, a draft grey.
function stateTone(item: IndexedItem): BadgeTone {
  if (item.merged) return 'soft-done'
  if (item.draft) return 'muted'
  if (item.state === 'open') return 'soft-success'
  return item.kind === 'issue' ? 'soft-done' : 'soft-destructive'
}

function ItemPreview({ item }: { item: IndexedItem }) {
  const { queries } = useApp()
  const issue = useQuery({ ...queries.gh.issue(item.number), enabled: useSettled(item.number, 120) === item.number })
  const body = issue.isError ? null : issue.data?.body
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
        <Badge variant={stateTone(item)} size="sm">
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
        {body === undefined ? <LinesSkeleton count={5} className="" /> : null}
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
