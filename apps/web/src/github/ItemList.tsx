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
} from '@duck-diff/ui'
import { Check, CircleDot, Copy, FileText, RefreshCw, SquareArrowOutUpRight } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import type { Store } from '../lib/store'
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

export function ItemList({ kind, label, selection, row, version = 0, actions, menuFor }: Props) {
  const { api } = useApp()
  const github = useGitHub()
  const ready = isReady(github)
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

  // The other state's total, for the Open / Closed switch in the box header.
  const [otherTotal, setOtherTotal] = useState<number | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: version and nonce exist only to trigger a reload
  useEffect(() => {
    if (!ready) return
    let alive = true
    const other = state === 'open' ? 'closed' : 'open'
    api.github.list({ kind, state: other, filter, sort, query }).then(
      (page) => alive && setOtherTotal(page.total),
      () => alive && setOtherTotal(null),
    )
    return () => {
      alive = false
    }
  }, [ready, api, kind, state, filter, sort, query, version, nonce])

  if (!ready) return <p className="p-6 text-muted-foreground">Sign in to see {label.toLowerCase()}.</p>

  const totals = { open: state === 'open' ? total : otherTotal, closed: state === 'closed' ? total : otherTotal }
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-64 flex-1"
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder={`Search ${label.toLowerCase()}: label:bug author:octo fix`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <Select value={filter} onValueChange={(value: string) => value && setFilter(value as ListQuery['filter'])}>
            <SelectTrigger aria-label="Filter" className="h-7 w-48">
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
            <SelectTrigger aria-label="Sort" className="h-7 w-44">
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
          <IconTool label={`Reload ${label.toLowerCase()}`} onClick={reload}>
            <RefreshCw />
          </IconTool>
          {actions}
        </div>
        <div className="rounded-md border border-border">
          <div
            role="tablist"
            aria-label="State"
            className="flex items-center gap-4 border-border border-b bg-card px-4 py-2">
            {(['open', 'closed'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={state === value}
                onClick={() => state !== value && setState(value)}
                className="flex cursor-pointer items-center gap-1.5 text-muted-foreground aria-selected:text-foreground">
                {value === 'open' ? <CircleDot className="size-4" /> : <Check className="size-4" />}
                {totals[value] === null ? '' : totals[value]?.toLocaleString()} {value === 'open' ? 'Open' : 'Closed'}
              </button>
            ))}
          </div>
          <div role="listbox" aria-label={label}>
            {failed ? <p className="p-4 text-removed">{failed}</p> : null}
            {!items && !failed ? SKELETONS.map((key) => <Skeleton key={key} className="m-3 h-12" />) : null}
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
            {loadingMore ? <Skeleton className="m-3 h-12" /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
