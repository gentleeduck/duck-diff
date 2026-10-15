import { createBrowserHistory, type RouterHistory } from '@tanstack/react-router'
import { hrefOf, readPlace } from '../router/place'
import { createStore } from './store'

// The router's browser history, with the furthest entry reached, so the page knows whether back and forward
// lead anywhere. The furthest one lives in sessionStorage across reloads.
const TOP_KEY = 'duck-diff:history-top'

const indexOf = (history: RouterHistory) => history.location.state.__TSR_index ?? 0
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

export const position = createStore({ index: 0, top: 0 })

let bound: RouterHistory | null = null
// True while back or forward is restoring the page, so the restore itself writes nothing.
let popping = false
export const isPopping = () => popping

// The page's one history; the url it opened with is rewritten to its canonical form, without the token.
export function createPageHistory(): RouterHistory {
  const history = createBrowserHistory()
  const { pathname, search } = history.location
  history.replace(hrefOf(readPlace(pathname, search)), history.location.state)
  return bindHistory(history)
}

// The history every helper here works on; tests bind a memory one.
export function bindHistory(history: RouterHistory): RouterHistory {
  bound = history
  const index = indexOf(history)
  position.set({ index, top: readTop(index) })
  history.subscribe(({ action }) => {
    if (history !== bound) return
    const index = indexOf(history)
    if (action.type === 'PUSH') saveTop(index)
    position.set((prev) => ({ index, top: action.type === 'PUSH' ? index : Math.max(prev.top, index) }))
    if (action.type === 'PUSH' || action.type === 'REPLACE') return
    popping = true
    setTimeout(() => {
      popping = false
    })
  })
  return history
}

// One click often changes two things (a view and the item in it); writes in the same task share one entry.
let pushedThisTask = false
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

export function go(href: string, replace = false) {
  const history = bound
  if (!history || href === history.location.href) return
  if (replace || replacing || pushedThisTask) return history.replace(href, history.location.state)
  pushedThisTask = true
  setTimeout(() => {
    pushedThisTask = false
  })
  history.push(href)
}

export const back = () => position.get().index > 0 && bound?.back()
export const forward = () => position.get().index < position.get().top && bound?.forward()
