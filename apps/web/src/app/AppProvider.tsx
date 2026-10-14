import { createContext, type ReactNode, type RefObject, useContext, useEffect, useMemo, useRef } from 'react'
import type { DiffViewHandle } from '../diff/DiffView'
import { type Api, createApi } from '../lib/api'
import { createStore, type Store } from '../lib/store'
import { readTarget } from '../lib/target-url'
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
