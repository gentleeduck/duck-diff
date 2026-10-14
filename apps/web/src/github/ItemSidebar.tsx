import { Button, Skeleton, Tabs, TabsList, TabsTrigger } from '@duck-diff/ui'
import { RefreshCw } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import type { ItemState } from '../lib/api'
import type { Store } from '../lib/store'
import { useStore } from '../lib/store'
import { useGitHub } from './SignIn'
import { isReady } from './store'

export interface ListItem {
  number: number
  title: string
}

interface Props<T extends ListItem> {
  label: string
  load(state: ItemState): Promise<T[]>
  selection: Store<number | null>
  row(item: T): ReactNode
  // Bumped by the page after it changes an item, so the list shows the new state.
  version?: number
  actions?: ReactNode
}

const selectNumber = (value: number | null) => value
const SKELETONS = ['a', 'b', 'c', 'd', 'e', 'f']

export function ItemSidebar<T extends ListItem>({ label, load, selection, row, version = 0, actions }: Props<T>) {
  const github = useGitHub()
  const ready = isReady(github)
  const selected = useStore(selection, selectNumber)
  const [state, setState] = useState<ItemState>('open')
  const [items, setItems] = useState<T[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: version and nonce exist only to trigger a reload
  useEffect(() => {
    if (!ready) return
    let alive = true
    setFailed(null)
    load(state).then(
      (next) => alive && setItems(next),
      (error: Error) => alive && setFailed(error.message),
    )
    return () => {
      alive = false
    }
  }, [ready, load, state, version, nonce])

  const reload = useCallback(() => {
    setItems(null)
    setNonce((n) => n + 1)
  }, [])

  if (!ready) return <p className="p-3 text-muted-foreground">Sign in to see {label.toLowerCase()}.</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-border border-b p-3">
        <Tabs
          value={state}
          onValueChange={(next) => {
            if (next === state) return
            setItems(null)
            setState(next as ItemState)
          }}
          className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="closed">Closed</TabsTrigger>
          </TabsList>
        </Tabs>
        {actions}
        <Button size="icon" variant="ghost" aria-label={`Reload ${label.toLowerCase()}`} onClick={reload}>
          <RefreshCw />
        </Button>
      </div>
      <div role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-2">
        {failed ? <p className="p-2 text-removed">{failed}</p> : null}
        {!items && !failed ? SKELETONS.map((key) => <Skeleton key={key} className="mb-2 h-14 w-full" />) : null}
        {items?.length === 0 ? (
          <p className="p-2 text-muted-foreground">
            No {state} {label.toLowerCase()}.
          </p>
        ) : null}
        {items?.map((item) => (
          <div
            key={item.number}
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
        ))}
      </div>
    </div>
  )
}
