import type { ListItem, ListQuery } from '@duck-diff/protocol'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@duck-diff/ui'
import { Copy, FileText, RefreshCw, SquareArrowOutUpRight } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import type { Store } from '../lib/store'
import { useStore } from '../lib/store'
import { useGitHub } from './SignIn'
import { isReady } from './store'

interface Props {
  kind: ListQuery['kind']
  label: string
  selection: Store<number | null>
  row(item: ListItem): ReactNode
  // Bumped by the page after it changes an item, so the list shows the new state.
  version?: number
  actions?: ReactNode
  // Extra right-click items, above the shared open and copy ones.
  menuFor?(item: ListItem, reload: () => void): ReactNode
}

const selectNumber = (value: number | null) => value
const SKELETONS = ['a', 'b', 'c', 'd', 'e', 'f']

const FILTERS: { value: ListQuery['filter']; label: string; kinds: ListQuery['kind'][] }[] = [
  { value: 'all', label: 'Everything', kinds: ['pr', 'issue'] },
  { value: 'mine', label: 'Opened by me', kinds: ['pr', 'issue'] },
  { value: 'review-requested', label: 'Review requested', kinds: ['pr'] },
  { value: 'assigned', label: 'Assigned to me', kinds: ['pr', 'issue'] },
  { value: 'mentioned', label: 'Mentioning me', kinds: ['pr', 'issue'] },
]
const SORTS: { value: ListQuery['sort']; label: string }[] = [
  { value: 'updated', label: 'Updated' },
  { value: 'created', label: 'Newest' },
  { value: 'comments', label: 'Most comments' },
]

async function copy(text: string, what: string) {
  await navigator.clipboard.writeText(text)
  toast(`Copied the ${what}`)
}

export function ItemSidebar({ kind, label, selection, row, version = 0, actions, menuFor }: Props) {
  const { api } = useApp()
  const github = useGitHub()
  const ready = isReady(github)
  const selected = useStore(selection, selectNumber)
  const [state, setState] = useState<ListQuery['state']>('open')
  const [filter, setFilter] = useState<ListQuery['filter']>('all')
  const [sort, setSort] = useState<ListQuery['sort']>('updated')
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<ListItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const end = useRef<HTMLDivElement>(null)

  // Typing settles for a moment before it becomes a search; GitHub limits search calls per minute.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), 350)
    return () => clearTimeout(timer)
  }, [typed])

  // biome-ignore lint/correctness/useExhaustiveDependencies: version and nonce exist only to trigger a reload
  useEffect(() => {
    if (!ready) return
    let alive = true
    setFailed(null)
    setItems(null)
    api.github.list({ kind, state, filter, sort, query }).then(
      (page) => {
        if (!alive) return
        setItems(page.items)
        setTotal(page.total)
        setCursor(page.cursor)
      },
      (error: Error) => alive && setFailed(error.message),
    )
    return () => {
      alive = false
    }
  }, [ready, api, kind, state, filter, sort, query, version, nonce])

  const more = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await api.github.list({ kind, state, filter, sort, query, after: cursor })
      setItems((prev) => [...(prev ?? []), ...page.items])
      setCursor(page.cursor)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }, [api, cursor, loadingMore, kind, state, filter, sort, query])

  // The next page loads as the end of the list scrolls into view.
  useEffect(() => {
    const target = end.current
    if (!target || !cursor) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void more()
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [cursor, more])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  if (!ready) return <p className="p-3 text-muted-foreground">Sign in to see {label.toLowerCase()}.</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-border border-b p-3">
        <div className="flex items-center gap-2">
          <Tabs
            value={state}
            onValueChange={(next) => next !== state && setState(next as ListQuery['state'])}
            className="flex-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="closed">Closed</TabsTrigger>
            </TabsList>
          </Tabs>
          {actions}
          <IconTool label={`Reload ${label.toLowerCase()}`} onClick={reload}>
            <RefreshCw />
          </IconTool>
        </div>
        <Input
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder="Search: label:bug author:me fix"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Select value={filter} onValueChange={(value: string) => value && setFilter(value as ListQuery['filter'])}>
            <SelectTrigger aria-label="Filter" className="h-7 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.filter((entry) => entry.kinds.includes(kind)).map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value: string) => value && setSort(value as ListQuery['sort'])}>
            <SelectTrigger aria-label="Sort" className="h-7 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-2">
        {failed ? <p className="p-2 text-removed">{failed}</p> : null}
        {!items && !failed ? SKELETONS.map((key) => <Skeleton key={key} className="mb-2 h-14 w-full" />) : null}
        {items?.length === 0 ? (
          <p className="p-2 text-muted-foreground">
            No {state} {label.toLowerCase()}
            {query || filter !== 'all' ? ' match' : ''}.
          </p>
        ) : null}
        {items?.length ? (
          <p className="px-2 pb-1 text-tn-comment">
            {total.toLocaleString()} {state}
          </p>
        ) : null}
        {items?.map((item) => (
          <ContextMenu key={item.number}>
            <ContextMenuTrigger asChild>
              <div
                role="option"
                tabIndex={0}
                aria-selected={item.number === selected}
                title={item.title}
                onClick={() => selection.set(item.number)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') selection.set(item.number)
                }}
                className="flex cursor-pointer gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60 aria-selected:bg-accent">
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
        {loadingMore ? <Skeleton className="mt-2 h-14 w-full" /> : null}
      </div>
    </div>
  )
}
