import type { CodeViewHandle } from '@pierre/diffs/react'
import { createContext, type ReactNode, type RefObject, useContext, useEffect, useMemo, useRef } from 'react'
import { type Api, createApi } from '../lib/api'
import type { Store } from '../lib/store'
import { readTarget } from '../lib/target-url'
import { createSession, type Session } from '../state/session'
import { createSettingsStore, type Settings } from '../state/settings'

interface AppContextValue {
  api: Api
  session: Session
  settings: Store<Settings>
  viewer: RefObject<CodeViewHandle<undefined, undefined> | null>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ api, children }: { api?: Api; children: ReactNode }) {
  const viewer = useRef<CodeViewHandle<undefined, undefined> | null>(null)
  const value = useMemo(() => {
    const client = api ?? createApi()
    return {
      api: client,
      session: createSession(client, readTarget(window.location.search)),
      settings: createSettingsStore(),
      viewer,
    }
  }, [api])

  useEffect(() => {
    void value.session.load(value.session.get().target)
  }, [value])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp needs an AppProvider')
  return value
}
