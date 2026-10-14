import { createContext, type ReactNode, type RefObject, useContext, useEffect, useMemo, useRef } from 'react'
import type { DiffViewHandle } from '../diff/DiffView'
import { createPullReview, type PullReview } from '../github/pull-review'
import { createGitHub, type GitHub } from '../github/store'
import { createGraph, type Graph } from '../graph/store'
import { type Api, createApi } from '../lib/api'
import { createStore, type Store } from '../lib/store'
import { readTarget } from '../lib/target-url'
import { readView, type View } from '../lib/view-url'
import { createReviews, type Reviews } from '../review/reviews'
import { createSession, type Session } from '../state/session'
import { createSettingsStore, type Settings } from '../state/settings'
import { createViewedStore, type Viewed } from '../state/viewed'

interface AppContextValue {
  api: Api
  session: Session
  settings: Store<Settings>
  reviews: Reviews
  viewed: Viewed
  // The file whose history the sidebar shows, or null for the branch history.
  fileHistory: Store<string | null>
  view: Store<View>
  graph: Graph
  // The commit open in the graph's side panel.
  graphSelection: Store<string | null>
  // The file open in the Files view.
  fileSelection: Store<string | null>
  github: GitHub
  // The pull request and issue open in their views.
  pullSelection: Store<number | null>
  issueSelection: Store<number | null>
  // GitHub's review threads for the pull request the diff shows.
  pullReview: PullReview
  viewer: RefObject<DiffViewHandle | null>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ api, children }: { api?: Api; children: ReactNode }) {
  const viewer = useRef<DiffViewHandle | null>(null)
  const value = useMemo(() => {
    const client = api ?? createApi()
    return {
      api: client,
      session: createSession(client, readTarget(window.location.search)),
      settings: createSettingsStore(),
      reviews: createReviews(client),
      viewed: createViewedStore(),
      fileHistory: createStore<string | null>(null),
      view: createStore<View>(readView(window.location.search)),
      graph: createGraph(client),
      graphSelection: createStore<string | null>(null),
      fileSelection: createStore<string | null>(null),
      github: createGitHub(client),
      pullSelection: createStore<number | null>(null),
      issueSelection: createStore<number | null>(null),
      pullReview: createPullReview(client),
      viewer,
    }
  }, [api])

  useEffect(() => {
    void value.session.load(value.session.get().target)
  }, [value])

  // Comments belong to a target, so they follow the session to whatever comparison it loads.
  useEffect(() => {
    const { session, reviews } = value
    let shown = session.get().target
    const loadReviews = () => {
      shown = session.get().target
      reviews.load(shown).catch(() => {})
    }
    loadReviews()
    return session.subscribe(() => {
      if (session.get().target !== shown) loadReviews()
    })
  }, [value])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp needs an AppProvider')
  return value
}
