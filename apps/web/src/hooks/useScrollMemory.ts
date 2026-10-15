import { type RefObject, useEffect, useRef } from 'react'
import { OWN_MEMORY } from '../app/ScrollKeeper'
import { isPopping, position } from '../lib/history'

// Where each scroll container was, per history entry and as last seen, so back, forward and coming back to a
// view land where the reader left. Kept in sessionStorage so a reload keeps it too.
const STORAGE_KEY = 'duck-diff:scroll'
const MAX_ENTRIES = 400

const memory: Map<string, number> = (() => {
  try {
    return new Map(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '[]') as [string, number][])
  } catch {
    return new Map()
  }
})()

let saveTimer: ReturnType<typeof setTimeout> | undefined
function remember(entry: string, last: string, top: number) {
  for (const key of [entry, last]) {
    memory.delete(key)
    memory.set(key, top)
  }
  while (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value as string)
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...memory]))
    } catch {}
  }, 300)
}

export const scrollMemoryKeys = (key: string, index = position.get().index) => ({
  entry: `${index}|${key}`,
  last: `last|${key}`,
})

// The spot a container should open at, for virtual lists that take a starting offset.
export function rememberedTop(key: string | null): number {
  if (key === null) return 0
  const { entry, last } = scrollMemoryKeys(key)
  return memory.get(entry) ?? (isPopping() ? undefined : memory.get(last)) ?? 0
}

// True when a remembered spot will be restored, so other automatic scrolls can stand aside.
export function hasScrollMemory(key: string, popped: boolean): boolean {
  const { entry, last } = scrollMemoryKeys(key)
  return memory.has(entry) || (!popped && memory.has(last))
}

// Content often arrives after the container (virtual lists, fetched pages), so restoring retries until the
// page is tall enough or a second has passed.
function restore(element: HTMLElement, top: number, done: () => void) {
  const started = performance.now()
  const step = () => {
    element.scrollTop = top
    const reached = Math.abs(element.scrollTop - top) < 2
    if (!reached && performance.now() - started < 1000) requestAnimationFrame(step)
    else done()
  }
  step()
}

// While a spot is restored, the page's own scrolls (a virtual list settling) are not the reader's.
const SETTLE_MS = 400

export function useScrollMemory(ref: RefObject<HTMLElement | null>, key: string | null) {
  // The container can be replaced while the key stays, so this re-attaches whenever either changes.
  const attached = useRef<{ element: HTMLElement | null; key: string | null; stop?: () => void }>({
    element: null,
    key: null,
  })
  useEffect(() => {
    const element = ref.current
    const current = attached.current
    if (current.element === element && current.key === key) return
    current.stop?.()
    attached.current = { element, key }
    if (!element || key === null) return
    // The page-wide ScrollKeeper leaves this container to its own memory.
    element.setAttribute(OWN_MEMORY, '')
    let settling = 0
    const place = (popped: boolean) => {
      const { entry, last } = scrollMemoryKeys(key)
      // A history step goes back to that entry's spot; arriving any other way returns to where the view was left.
      const saved = memory.get(entry) ?? (popped ? undefined : memory.get(last))
      if (saved === undefined) return
      settling = performance.now() + SETTLE_MS
      restore(element, saved, () => (settling = performance.now() + 50))
    }
    place(isPopping())
    let height = element.scrollHeight
    const onScroll = () => {
      // Content shrinking (a reload rebuilding the page) clamps the position; that is not the reader moving.
      const shrank = element.scrollHeight < height
      height = element.scrollHeight
      if (shrank || performance.now() < settling) return
      const { entry, last } = scrollMemoryKeys(key)
      remember(entry, last, element.scrollTop)
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    let shown = position.get().index
    const stop = position.subscribe(() => {
      if (position.get().index === shown) return
      shown = position.get().index
      if (isPopping()) place(true)
    })
    attached.current.stop = () => {
      element.removeEventListener('scroll', onScroll)
      stop()
    }
  })
  // Unmounted or hidden (a kept view behind another): let go, so showing it again attaches and restores.
  useEffect(
    () => () => {
      attached.current.stop?.()
      attached.current = { element: null, key: null }
    },
    [],
  )
}
