import type { ListItem, ListQuery } from '@duck-diff/protocol'
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@duck-diff/ui'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Check, ChevronDown, CircleDot, Copy, FileText, RefreshCw, Search, SquareArrowOutUpRight } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { pageColumn } from '../app/page-column'
import { ItemRowsSkeleton } from '../app/skeletons'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { useKept } from '../lib/kept'
import type { Store } from '../lib/store'
import { ListFilters } from './ListFilters'
import { useGitHub } from './SignIn'
import { isReady } from './store'

interface Props {
  kind: ListQuery['kind']
  label: string
  selection: Store<number | null>
  row(item: ListItem): ReactNode
  actions?: ReactNode
  // Extra right-click items, above the shared open and copy ones.
  menuFor?(item: ListItem, reload: () => void): ReactNode
}

const FILTERS: { value: ListQuery['filter']; label: string; kinds: ListQuery['kind'][] }[] = [
  { value: 'all', label: 'Everything', kinds: ['pr', 'issue'] },
  { value: 'mine', label: 'Opened by me', kinds: ['pr', 'issue'] },
  { value: 'review-requested', label: 'Review requested', kinds: ['pr'] },
  { value: 'assigned', label: 'Assigned to me', kinds: ['pr', 'issue'] },
  { value: 'mentioned', label: 'Mentioning me', kinds: ['pr', 'issue'] },
]
async function copy(text: string, what: string) {
  await navigator.clipboard.writeText(text)
  toast.success(`Copied the ${what}`, { description: text })
}

export function ItemList({ kind, label, selection, row, actions, menuFor }: Props) {
  const { queries } = useApp()
  const github = useGitHub()
  const ready = isReady(github)
  const [state, setState] = useKept<ListQuery['state']>(`list:${kind}:state`, 'open')
  const [filter, setFilter] = useKept<ListQuery['filter']>(`list:${kind}:filter`, 'all')
  const [sort, setSort] = useKept<ListQuery['sort']>(`list:${kind}:sort`, 'updated')
  const [typed, setTyped] = useKept(`list:${kind}:typed`, '')
  const [query, setQuery] = useKept(`list:${kind}:query`, '')
  const list = useInfiniteQuery({ ...queries.gh.list({ kind, state, filter, sort, query }), enabled: ready })
  // The other state's first page gives its total for the Open / Closed switch, and makes switching instant.
  const other = useInfiniteQuery({
    ...queries.gh.list({ kind, state: state === 'open' ? 'closed' : 'open', filter, sort, query }),
    enabled: ready,
  })
  const items = list.data?.pages.flatMap((page) => page.items) ?? null
  const total = list.data?.pages[0]?.total ?? 0
  const otherTotal = other.data?.pages[0]?.total ?? null
  const failed = list.error ? list.error.message : null
  const loadingMore = list.isFetchingNextPage
  const end = useRef<HTMLDivElement>(null)
  const page = useRef<HTMLDivElement>(null)
  // Waits for the first page of items, so the list is tall enough to land where it was.
  useScrollMemory(page, ready && items ? `list:${kind}:${state}:${filter}:${sort}:${query}` : null)

  // Typing settles for a moment before it becomes a search; GitHub limits search calls per minute.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), 350)
    return () => clearTimeout(timer)
  }, [typed, setQuery])

  // The next page loads as the end of the list scrolls into view.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    const target = end.current
    if (!target || !hasNextPage) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const refetch = list.refetch
  const reload = useCallback(() => void refetch(), [refetch])

  if (!ready) return <p className="p-6 text-muted-foreground">Sign in to see {label.toLowerCase()}.</p>

  const totals = { open: state === 'open' ? total : otherTotal, closed: state === 'closed' ? total : otherTotal }
  return (
    <div ref={page} className="h-full overflow-y-auto">
      <div {...pageColumn('gap-4')}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-64 flex-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-e-none">
                  Filters
                  <ChevronDown />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="flex w-60 flex-col p-1">
                {FILTERS.filter((entry) => entry.kinds.includes(kind)).map((entry) => (
                  <Button
                    variant="nothing"
                    size="none"
                    key={entry.value}
                    type="button"
                    onClick={() => setFilter(entry.value)}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-start hover:bg-accent justify-start">
                    <span className="w-4">{filter === entry.value ? <Check className="size-4" /> : null}</span>
                    {entry.label}
                  </Button>
                ))}
              </PopoverContent>
            </Popover>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="rounded-s-none border-s-0 ps-8"
                aria-label={`Search ${label.toLowerCase()}`}
                placeholder={`is:${kind} is:${state} ${typed ? '' : 'label:bug author:octo fix'}`.trim()}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
          </div>
          <IconTool label={`Reload ${label.toLowerCase()}`} onClick={reload}>
            <RefreshCw />
          </IconTool>
          {actions}
        </div>
        <div className="rounded-md border border-border">
          <div className="flex flex-wrap items-center gap-4 border-border border-b bg-card px-4 py-2">
            <Tabs value={state} onValueChange={(next) => next !== state && setState(next as 'open' | 'closed')}>
              <TabsList aria-label="State" className="h-auto gap-4 bg-transparent p-0">
                {(['open', 'closed'] as const).map((value) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="h-auto gap-1.5 bg-transparent px-0 text-muted-foreground shadow-none hover:text-foreground aria-selected:text-foreground">
                    {value === 'open' ? <CircleDot className="size-4" /> : <Check className="size-4" />}
                    {totals[value] === null ? '' : totals[value]?.toLocaleString()}{' '}
                    {value === 'open' ? 'Open' : 'Closed'}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <ListFilters
              kind={kind}
              query={typed}
              onQuery={(next) => {
                setTyped(next)
                setQuery(next.trim())
              }}
              sort={sort}
              onSort={setSort}
            />
          </div>
          <div role="listbox" aria-label={label}>
            {failed ? <p className="p-4 text-removed">{failed}</p> : null}
            {!items && !failed ? <ItemRowsSkeleton /> : null}
            {items?.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground">
                No {state} {label.toLowerCase()}
                {query || filter !== 'all' ? ' match' : ''}.
              </p>
            ) : null}
            {items?.map((item) => (
              <ContextMenu key={item.number}>
                <ContextMenuTrigger asChild>
                  <div
                    role="option"
                    tabIndex={0}
                    aria-selected={false}
                    title={item.title}
                    onClick={() => selection.set(item.number)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') selection.set(item.number)
                    }}
                    className="flex cursor-pointer gap-3 border-border border-b px-4 py-2 last:border-b-0 hover:bg-accent/40">
                    {row(item)}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuLabel>
                    #{item.number} {item.title}
                  </ContextMenuLabel>
                  <ContextMenuItem onSelect={() => selection.set(item.number)}>
                    <FileText />
                    Open
                  </ContextMenuItem>
                  {menuFor?.(item, reload)}
                  <ContextMenuItem onSelect={() => window.open(item.url, '_blank', 'noreferrer')}>
                    <SquareArrowOutUpRight />
                    Open on GitHub
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => void copy(item.url, 'link')}>
                    <Copy />
                    Copy link
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => void copy(`#${item.number}`, 'number')}>
                    <Copy />
                    Copy number
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            <div ref={end} className="h-1" />
            {loadingMore ? <ItemRowsSkeleton count={2} /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
