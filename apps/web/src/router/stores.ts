import type { RouterHistory } from '@tanstack/react-router'
import { go } from '../lib/history'
import type { Store } from '../lib/store'
import { hrefOf, type Place, type PullTab, readPlace, type View } from './place'

export interface PlaceStores {
  place: Store<Place>
  view: Store<View>
  pullSelection: Store<number | null>
  issueSelection: Store<number | null>
  pullTab: Store<PullTab>
  fileSelection: Store<string | null>
  fileLine: Store<number | null>
  fileAt: Store<string | null>
  graphSelection: Store<string | null>
  // The file the diff is at, in changes or in a pull request's files.
  diffFile: Store<string | null>
  mergeFile: Store<string | null>
}

type Next<T> = T | ((prev: T) => T)
const resolve = <T>(next: Next<T>, prev: T) => (typeof next === 'function' ? (next as (prev: T) => T)(prev) : next)

// The url is the one source of where the page is: each store reads its part of the history's location, and
// setting one navigates. A value that belongs to a view (a pull request, a commit) opens that view too.
export function createPlaceStores(history: RouterHistory): PlaceStores {
  let place = readPlace(history.location.pathname, history.location.search)
  // Where each view was last left, so coming back to it lands there again.
  const last = new Map<View, Place>([[place.view, place]])
  const listeners = new Set<() => void>()
  history.subscribe(() => {
    const next = readPlace(history.location.pathname, history.location.search)
    if (hrefOf(next) === hrefOf(place)) return
    place = next
    last.set(place.view, place)
    for (const listener of [...listeners]) listener()
  })
  const navigate = (next: Place) => go(hrefOf(next))

  function field<T>(read: (place: Place) => T, write: (place: Place, value: T) => Place): Store<T> {
    return {
      get: () => read(place),
      set(next) {
        const value = resolve(next, read(place))
        if (value !== read(place)) navigate(write(place, value))
      },
      subscribe(listener) {
        let seen = read(place)
        const check = () => {
          const now = read(place)
          if (now === seen) return
          seen = now
          listener()
        }
        listeners.add(check)
        return () => listeners.delete(check)
      },
    }
  }

  return {
    place: {
      get: () => place,
      set: (next) => navigate(resolve(next, place)),
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    view: field(
      (now) => now.view,
      (now, view) => ({ ...(last.get(view) ?? { ...now, number: null, path: null }), view, target: now.target }),
    ),
    pullSelection: field(
      (now) => (now.view === 'prs' ? now.number : null),
      (now, number) => ({ ...now, view: 'prs', number, tab: 'conversation', path: null }),
    ),
    issueSelection: field(
      (now) => (now.view === 'issues' ? now.number : null),
      (now, number) => ({ ...now, view: 'issues', number }),
    ),
    pullTab: field(
      (now) => now.tab,
      (now, tab) => ({ ...now, view: 'prs', tab }),
    ),
    fileSelection: field(
      (now) => now.file,
      (now, file) => ({ ...now, view: 'files', file }),
    ),
    fileLine: field(
      (now) => now.line,
      (now, line) => ({ ...now, view: 'files', line }),
    ),
    fileAt: field(
      (now) => now.at,
      (now, at) => ({ ...now, view: 'files', at }),
    ),
    graphSelection: field(
      (now) => now.commit,
      (now, commit) => ({ ...now, view: 'graph', commit }),
    ),
    diffFile: field(
      (now) => (now.view === 'changes' || now.view === 'prs' ? now.path : null),
      (now, path) => ({ ...now, view: now.view === 'prs' && now.number !== null ? 'prs' : 'changes', path }),
    ),
    mergeFile: field(
      (now) => (now.view === 'merge' ? now.path : null),
      (now, path) => ({ ...now, view: 'merge', path }),
    ),
  }
}
