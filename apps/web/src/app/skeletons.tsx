import { Skeleton } from '@duck-diff/ui'
import { useSettings } from '../hooks/useSettings'
import type { Settings } from '../state/settings'
import { pageColumn, THREAD_GRID } from './page-column'

const selectSplit = (settings: Settings) => settings.diffStyle === 'split'

// Loading states drawn as the page they stand for: the same containers, paddings and line heights, with
// bars where the text will be, so nothing moves when the content arrives.

// Varied but fixed widths, so rows look like text without changing between renders.
const WIDTHS = ['w-3/5', 'w-2/5', 'w-4/5', 'w-1/2', 'w-2/3', 'w-1/3', 'w-3/4', 'w-[45%]']
const width = (index: number) => WIDTHS[index % WIDTHS.length] as string
const keys = (count: number) => Array.from({ length: count }, (_, index) => `s${index}`)

// One line of text: exactly a line tall, with a bar the height of the letters.
export function TextLine({ className = 'w-40' }: { className?: string }) {
  // A width in percent is of the line, so the line takes the row.
  const relative = /\/|%/.test(className)
  return (
    <span className={`flex h-[1lh] min-w-0 items-center ${relative ? 'w-full' : ''}`}>
      <Skeleton className={`h-[0.7em] ${className}`} />
    </span>
  )
}

export function Dot({ className = 'size-4' }: { className?: string }) {
  return <Skeleton className={`shrink-0 rounded-full ${className}`} />
}

// The pull request and issue lists (ItemList, ListRow).
export function ItemRowsSkeleton({ count = 8 }: { count?: number }) {
  return keys(count).map((key, index) => (
    <div key={key} className="flex gap-3 border-border border-b px-4 py-2 last:border-b-0">
      <span className="pt-0.5">
        <Dot />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <TextLine className={width(index)} />
        <TextLine className="w-48" />
      </span>
      <span className="flex shrink-0 items-start gap-3 pt-0.5">
        <span className="w-10" />
      </span>
    </div>
  ))
}

// Rows of a bordered list with an icon and one or two lines (inbox, actions, commits, checks).
export function ListRowsSkeleton({
  count = 6,
  twoLines = false,
  avatar = false,
  py = 'py-2',
}: {
  count?: number
  twoLines?: boolean
  avatar?: boolean
  py?: string
}) {
  return keys(count).map((key, index) => (
    <div key={key} className={`flex items-center gap-3 border-border border-b px-4 ${py} last:border-b-0`}>
      <Dot className={avatar ? 'size-5' : 'size-4'} />
      <span className="flex min-w-0 flex-1 flex-col">
        <TextLine className={width(index)} />
        {twoLines ? <TextLine className="w-40" /> : null}
      </span>
      <TextLine className="w-14" />
    </div>
  ))
}

// A timeline comment (Timeline's CommentCard): the avatar beside a card with its header and a few lines.
export function CommentSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="relative flex gap-3">
      <span className="hidden sm:block">
        <Dot className="size-10" />
      </span>
      <div className="min-w-0 flex-1 rounded-md border border-border bg-card">
        <div className="flex min-h-10 items-center gap-1.5 rounded-t-md border-border border-b bg-muted/40 px-3 py-1">
          <TextLine className="w-24" />
          <TextLine className="w-28" />
        </div>
        <div className="flex flex-col px-3 py-2">
          {keys(lines).map((key, index) => (
            <TextLine key={key} className={width(index + 2)} />
          ))}
        </div>
      </div>
    </div>
  )
}

// The pull request and issue list page (ItemList): the filter bar, then the box with its Open / Closed header.
export function ItemListSkeleton() {
  return (
    <div {...pageColumn('gap-4')} aria-busy="true">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-7 min-w-0 flex-1 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-7 w-36 rounded-md" />
      </div>
      <div className="rounded-md border border-border">
        <div className="flex flex-wrap items-center gap-4 border-border border-b bg-card px-4 py-2">
          <TextLine className="w-16" />
          <TextLine className="w-20" />
          <span className="ms-auto flex gap-4">
            {['w-14', 'w-12', 'w-20', 'w-16', 'w-20'].map((size) => (
              <TextLine key={size} className={size} />
            ))}
          </span>
        </div>
        <ItemRowsSkeleton />
      </div>
    </div>
  )
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-3 self-start">
      {['Reviewers', 'Assignees', 'Labels', 'Milestone'].map((title) => (
        <div key={title} className="flex flex-col gap-2 border-border border-b pb-3 last:border-b-0">
          <span className="flex h-7 items-center">
            <TextLine className="w-20" />
          </span>
          <span className="flex items-center gap-2">
            <Dot className="size-5" />
            <TextLine className="w-28" />
          </span>
        </div>
      ))}
    </div>
  )
}

// A pull request or issue page: back link, title, the state line, tabs, then the conversation and sidebar.
export function ThreadSkeleton({ tabs = false }: { tabs?: boolean }) {
  return (
    <div {...pageColumn('gap-3')} aria-busy="true">
      <TextLine className="w-20" />
      <div className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 text-[1.75em] leading-tight">
          <TextLine className="w-3/5" />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <TextLine className="w-72" />
      </div>
      {tabs ? (
        <div className="flex items-end gap-4 border-border border-b pb-1.5">
          {['w-28', 'w-20', 'w-16', 'w-24'].map((size) => (
            <TextLine key={size} className={size} />
          ))}
        </div>
      ) : null}
      <div className={THREAD_GRID}>
        <div className="flex min-w-0 flex-col gap-4">
          <CommentSkeleton lines={4} />
          <CommentSkeleton lines={2} />
        </div>
        <SidebarSkeleton />
      </div>
    </div>
  )
}

// The diff: file headers (FileHeader, h-11) over code rows with both gutters.
export function DiffSkeleton({ files = 3 }: { files?: number }) {
  const split = useSettings(selectSplit)
  return (
    <div className="h-full overflow-hidden" aria-busy="true">
      {keys(files).map((file, fileIndex) => (
        <div key={file}>
          <div className="flex h-11 items-center gap-3 border-border border-b bg-card px-3">
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="h-5 w-16 rounded-md" />
            <TextLine className={fileIndex % 2 ? 'w-72' : 'w-96'} />
            <TextLine className="w-16" />
          </div>
          <CodeRowsSkeleton count={fileIndex === 0 ? 14 : 8} split={split} offset={fileIndex} />
        </div>
      ))}
    </div>
  )
}

const selectCode = (settings: Settings) => settings.fontSize

// One side of a code row: line number gutter, marker column, then the code (RowViews' layout).
function CodeSide({ index }: { index: number }) {
  return (
    <span className="flex min-w-0 flex-1">
      <span className="flex w-12 shrink-0 justify-end pe-2">
        <TextLine className="w-5 opacity-50" />
      </span>
      <span className="w-6 shrink-0" />
      <span className="w-4 shrink-0" />
      <span className="flex min-w-0 flex-1 pe-4">
        <TextLine className={width(index)} />
      </span>
    </span>
  )
}

// Code lines at the size and line height the diff and file views use; split shows both sides of the diff.
export function CodeRowsSkeleton({
  count = 24,
  split = false,
  offset = 0,
}: {
  count?: number
  split?: boolean
  offset?: number
}) {
  const fontSize = useSettings(selectCode)
  return (
    <div className="overflow-hidden" style={{ fontSize, lineHeight: `${Math.round(fontSize * 1.5)}px` }}>
      {keys(count).map((key, index) => (
        <div key={key} className="flex">
          <CodeSide index={index + offset} />
          {split ? (
            <>
              <span className="w-px shrink-0 bg-border" />
              <CodeSide index={index + offset + 3} />
            </>
          ) : null}
        </div>
      ))}
    </div>
  )
}

// Tree and graph rows: 28px rows with an icon and a name.
export function TreeSkeleton({ count = 14 }: { count?: number }) {
  return (
    <div className="flex flex-col py-1" aria-busy="true">
      {keys(count).map((key, index) => (
        <div
          key={key}
          className="flex h-7 items-center gap-2 pe-3"
          style={{ paddingInlineStart: 8 + (index % 3) * 12 }}>
          <Skeleton className="size-4 rounded-sm" />
          <TextLine className={index % 3 ? 'w-28' : 'w-20'} />
        </div>
      ))}
    </div>
  )
}

export function GraphSkeleton({ count = 24 }: { count?: number }) {
  return (
    <div className="flex flex-col" aria-busy="true">
      {keys(count).map((key, index) => (
        <div key={key} className="flex h-7 items-center gap-2 pe-2">
          <span className="flex w-8 shrink-0 justify-center ps-2">
            <Dot className="size-2.5" />
          </span>
          <TextLine className={width(index)} />
          <TextLine className="w-24 opacity-60" />
        </div>
      ))}
    </div>
  )
}

// Cards in a column (releases, discussions, security alerts).
export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return keys(count).map((key, index) => (
    <div key={key} className="flex flex-col gap-3 rounded-md border border-border p-4">
      <span className="flex items-center gap-2">
        <TextLine className="w-48" />
        <Skeleton className="h-5 w-14 rounded-md" />
      </span>
      <span className="flex flex-col">
        <TextLine className={width(index)} />
        <TextLine className={width(index + 3)} />
      </span>
    </div>
  ))
}

// A box of a few labelled rows (merge box, checks summary).
export function BoxSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-md border border-border" aria-busy="true">
      {keys(rows).map((key, index) => (
        <div key={key} className="flex items-center gap-3 border-border border-b p-4 last:border-b-0">
          <Dot className="size-8" />
          <span className="flex min-w-0 flex-1 flex-col">
            <TextLine className={width(index)} />
            <TextLine className="w-56 opacity-60" />
          </span>
        </div>
      ))}
    </div>
  )
}

// Short lines for small panels and popovers (pickers, previews, hover cards).
export function LinesSkeleton({ count = 4, className = 'p-3' }: { count?: number; className?: string }) {
  return (
    <div className={`flex flex-col ${className}`} aria-busy="true">
      {keys(count).map((key, index) => (
        <TextLine key={key} className={width(index)} />
      ))}
    </div>
  )
}

// The sidebar's history: two-line commit buttons (HistoryList).
export function HistorySkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden py-1" aria-busy="true">
      {keys(count).map((key, index) => (
        <div key={key} className="mx-2 flex flex-col gap-0.5 px-2 py-1.5">
          <TextLine className={width(index)} />
          <span className="flex gap-2">
            <TextLine className="w-14" />
            <TextLine className="w-20" />
            <span className="ml-auto">
              <TextLine className="w-12" />
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

// What a view looks like while its code loads, so switching to it never shows a blank page.
export function ViewSkeleton({ view, item = false }: { view: string; item?: boolean }) {
  if ((view === 'prs' || view === 'issues') && item) return <ThreadSkeleton tabs={view === 'prs'} />
  if (view === 'prs' || view === 'issues') return <ItemListSkeleton />
  if (view === 'changes') return <DiffSkeleton />
  if (view === 'graph') return <GraphSkeleton />
  if (view === 'files' || view === 'merge') return <CodeRowsSkeleton count={30} />
  if (view === 'prs' || view === 'issues' || view === 'inbox' || view === 'actions')
    return (
      <div {...pageColumn('gap-4')} aria-busy="true">
        <TextLine className="w-72" />
        <div className="rounded-md border border-border">
          <ItemRowsSkeleton />
        </div>
      </div>
    )
  return (
    <div {...pageColumn('gap-4')} aria-busy="true">
      <CardsSkeleton />
    </div>
  )
}
