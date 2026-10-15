import { targetKey } from '@duck-diff/protocol'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import type { RouterHistory } from '@tanstack/react-router'
import { createContext, type ReactNode, type RefObject, useContext, useEffect, useMemo, useRef } from 'react'
import type { SymbolTarget } from '../code-nav/symbol-at'
import type { DiffViewHandle } from '../diff/DiffView'
import { highlighter } from '../diff/highlighter'
import { createPullReview, type PullReview } from '../github/pull-review'
import { createGraph, type Graph } from '../graph/store'
import { createKeyOverrides, createKeyState, type KeyOverrides, type KeyState } from '../keys/state'
import { type Api, createApi } from '../lib/api'
import { createPageHistory } from '../lib/history'
import { whenIdle } from '../lib/idle'
import { onServer } from '../lib/saved'
import { createStore, type Store } from '../lib/store'
import { saveTokens } from '../live/saveTokens'
import { createJobs, type Jobs } from '../panel/jobs'
import { createPanel, type Panel } from '../panel/panel'
import { invalidateTopic } from '../query/client'
import { type GitQueries, gitQueries } from '../query/git'
import { type GitHubQueries, githubQueries } from '../query/github'
import { QueryProvider } from '../query/QueryProvider'
import { createReviews, type Reviews } from '../review/reviews'
import { createPlaceStores, type PlaceStores } from '../router/stores'
import { createRefs, type Refs } from '../state/refs'
import { createSession, readSeed, type Session } from '../state/session'
import { createSettingsStore, type Settings } from '../state/settings'
import { createTabs, type Tabs } from '../state/tabs'
import { createViewedStore, type Viewed } from '../state/viewed'
import { createTerminalTabs, type TerminalTabs } from '../terminal/tabs'

// Where the page is (view, open item, comparison) comes from the url through these stores (router/stores.ts).
export interface AppContextValue extends PlaceStores {
  history: RouterHistory
  api: Api
  session: Session
  // Branches, tags and recent commits, shared by every picker.
  refs: Refs
  settings: Store<Settings>
  reviews: Reviews
  viewed: Viewed
  // The file whose history the sidebar shows, or null for the branch history.
  fileHistory: Store<string | null>
  graph: Graph
  // What the graph's find box holds, so matching rows can stand out.
  graphQuery: Store<string>
  // Folders folded in the changes tree; their files fold in the diff too.
  changesFolders: Store<ReadonlySet<string>>
  // The name clicked in code, whose definitions and uses the symbol panel lists.
  symbol: Store<SymbolTarget | null>
  // Files whose blame the diff shows, by path; emptied when the diff shows another comparison.
  blameFiles: Store<ReadonlySet<string>>
  // The file at the top of the diff as it scrolls, which the changes tree highlights.
  diffTop: Store<string | null>
  // The diffs open side by side above the viewer; the first is always the working tree.
  tabs: Tabs
  // GitHub's review threads for the pull request the diff shows.
  pullReview: PullReview
  viewer: RefObject<DiffViewHandle | null>
  // Every read as a TanStack Query, by source, and the cache they share for reads made outside a component.
  queries: { gh: GitHubQueries; git: GitQueries }
  queryClient: QueryClient
  // The git actions run from any page, with their commands and output.
  jobs: Jobs
  // The bottom panel: output and terminals.
  panel: Panel
  // The shells open in the bottom panel.
  terminalTabs: TerminalTabs
  // Vim-style keys: the mode, keys typed so far, and the user's own bindings.
  keys: Store<KeyState>
  keyOverrides: KeyOverrides
}

const AppContext = createContext<AppContextValue | null>(null)

// persist: the real page keeps answers between reloads (QueryProvider); tests start empty.
export function AppProvider({ api, persist, children }: { api?: Api; persist?: boolean; children: ReactNode }) {
  return (
    <QueryProvider persist={persist}>
      <AppState api={api}>{children}</AppState>
    </QueryProvider>
  )
}

function AppState({ api, children }: { api?: Api; children: ReactNode }) {
  const viewer = useRef<DiffViewHandle | null>(null)
  const queryClient = useQueryClient()
  const value = useMemo(() => {
    const client = api ?? createApi()
    const history = createPageHistory()
    const location = createPlaceStores(history)
    const target = location.place.get().target
    const seed = api ? null : readSeed()
    if (seed?.tokens) highlighter.prime(seed.tokens)
    const session = createSession(client, target, seed)
    const queries = { gh: githubQueries(client), git: gitQueries(client) }
    return {
      api: client,
      session,
      refs: createRefs(client, session, {
        refs: () => queryClient.fetchQuery(queries.git.refs()),
        commits: () => queryClient.fetchQuery(queries.git.commits({ head: 'HEAD', limit: 50 })),
        cached: () => queryClient.getQueryData(queries.git.refs().queryKey),
      }),
      settings: createSettingsStore(),
      reviews: createReviews(client),
      viewed: createViewedStore(),
      fileHistory: createStore<string | null>(null),
      history,
      ...location,
      graph: createGraph(client),
      graphQuery: createStore(''),
      symbol: createStore<SymbolTarget | null>(null),
      changesFolders: createStore<ReadonlySet<string>>(new Set()),
      diffTop: createStore<string | null>(null),
      blameFiles: createStore<ReadonlySet<string>>(new Set()),
      tabs: createTabs(target),
      pullReview: createPullReview(client, {
        pull: (number) => queryClient.fetchQuery(queries.gh.pull(number)),
        reviewState: (number) => queryClient.fetchQuery(queries.gh.reviewState(number)),
        changed: (number) => invalidateTopic(queryClient, `item:${number}`),
      }),
      viewer,
      queries,
      queryClient,
      jobs: createJobs(client),
      panel: createPanel(),
      terminalTabs: createTerminalTabs(client),
      keys: createKeyState(),
      keyOverrides: createKeyOverrides(),
    }
  }, [api, queryClient])

  useEffect(() => {
    return whenIdle(() => {
      value.jobs.load().catch(() => {})
      value.terminalTabs.load().catch(() => {})
    })
  }, [value])

  // The diff shows the url's comparison, whether a click, back and forward or Neovim changed it. Only a
  // different comparison reloads; stepping between views of the same one keeps the page as it was.
  useEffect(() => {
    const { place, session, tabs } = value
    return place.subscribe(() => {
      const { target } = place.get()
      if (targetKey(target) === targetKey(session.get().target)) return
      tabs.open(target)
      void session.load(target)
    })
  }, [value])

  // Tabs are saved per repository, so they come back once the page knows which one it shows.
  useEffect(() => {
    value.queryClient.fetchQuery(value.queries.git.repo()).then(
      (info) => value.tabs.restore(info.root),
      () => {},
    )
  }, [value])

  useEffect(() => (api || !onServer ? undefined : saveTokens(value.session)), [api, value])

  useEffect(() => {
    // The highlighter starts with the page and loads the changed files' grammars while the diff is read,
    // so the first rows arrive colored.
    highlighter.warm([])
    // The diff is read first only when it is the page being opened; other views get their own data out
    // first and the diff follows once the page is idle.
    const loadDiff = () => void value.session.load(value.session.get().target)
    const opening = value.view.get()
    // A diff that came with the page is already drawn; reading it again waits like the other views' do.
    if (opening === 'changes' && value.session.get().status !== 'ready') loadDiff()
    else {
      // So does a graph that came with it.
      if (opening === 'graph' && value.graph.get().status !== 'ready') void value.graph.load()
      else if (opening === 'graph') whenIdle(() => void value.graph.load())
      whenIdle(loadDiff)
    }
    let warmed = false
    return value.session.subscribe(() => {
      const files = value.session.get().files
      if (warmed || !files.length) return
      warmed = true
      highlighter.warm(files.slice(0, 40).map((file) => file.path))
      // Language servers start with the page, so the first go-to-definition is answered by a warm one.
      value.api.lsp.warm(files.slice(0, 50).map((file) => file.path)).catch(() => {})
    })
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
