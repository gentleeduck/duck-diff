import { createStore } from './store'

// Browser history with a position, so the page knows whether back and forward lead anywhere.
// Each entry carries its index; the furthest one reached lives in sessionStorage across reloads.
const TOP_KEY = 'duck-diff:history-top'

const readIndex = (): number => {
  const state = window.history.state as { idx?: unknown } | null
  return typeof state?.idx === 'number' ? state.idx : 0
}
const readTop = (index: number): number => {
  try {
    const stored = Number(window.sessionStorage.getItem(TOP_KEY))
    return Number.isInteger(stored) && stored >= index ? stored : index
  } catch {
    return index
  }
}
const saveTop = (top: number) => {
  try {
    window.sessionStorage.setItem(TOP_KEY, String(top))
  } catch {}
}

export const position = createStore(
  (() => {
    const index = readIndex()
    return { index, top: readTop(index) }
  })(),
)

// One click often changes two things (a view and the item in it); writes in the same task share one entry.
let pushedThisTask = false
// True while back or forward is restoring the page, so the restore itself writes nothing.
let popping = false
export const isPopping = () => popping

// Defaults the page picks by itself (like README in Files) replace the entry instead of adding one.
let replacing = false
export function withoutHistory(change: () => void) {
  replacing = true
  try {
    change()
  } finally {
    replacing = false
  }
}

export function pushUrl(search: string) {
  if (search === window.location.search || (search === '?' && !window.location.search)) return
  if (pushedThisTask || replacing) {
    window.history.replaceState({ idx: position.get().index }, '', search)
    return
  }
  pushedThisTask = true
  setTimeout(() => {
    pushedThisTask = false
  })
  const index = position.get().index + 1
  window.history.pushState({ idx: index }, '', search)
  saveTop(index)
  position.set({ index, top: index })
}

export function replaceUrl(search: string) {
  window.history.replaceState({ idx: position.get().index }, '', search)
}

if (typeof window !== 'undefined') {
  if (typeof (window.history.state as { idx?: unknown } | null)?.idx !== 'number') {
    window.history.replaceState({ idx: position.get().index }, '', window.location.href)
  }
  window.addEventListener('popstate', () => {
    popping = true
    setTimeout(() => {
      popping = false
    })
    const index = readIndex()
    position.set((prev) => ({ index, top: Math.max(prev.top, index) }))
  })
}

export const back = () => position.get().index > 0 && window.history.back()
export const forward = () => position.get().index < position.get().top && window.history.forward()
