import { createContext, type ReactNode, type RefObject, useContext, useEffect, useMemo, useRef } from 'react'
import type { SymbolTarget } from '../code-nav/symbol-at'
import type { DiffViewHandle } from '../diff/DiffView'
import { highlighter } from '../diff/highlighter'
import { createItemIndex, type ItemIndex } from '../github/item-index'
import { createPullReview, type PullReview } from '../github/pull-review'
import { createGitHub, type GitHub, isReady } from '../github/store'
import { createGraph, type Graph } from '../graph/store'
import { createKeyOverrides, createKeyState, type KeyOverrides, type KeyState } from '../keys/state'
import { type Api, createApi } from '../lib/api'
import { createStore, type Store } from '../lib/store'
import { readTarget } from '../lib/target-url'
import { type PullTab, readView, type View } from '../lib/view-url'
import { createJobs, type Jobs } from '../panel/jobs'
import { createPanel, type Panel } from '../panel/panel'
import { createReviews, type Reviews } from '../review/reviews'
import { createRefs, type Refs } from '../state/refs'
import { createSession, type Session } from '../state/session'
import { createSettingsStore, type Settings } from '../state/settings'
import { createStage, type Stage } from '../state/stage'
import { createTabs, type Tabs } from '../state/tabs'
import { createViewedStore, type Viewed } from '../state/viewed'
import { createTerminalTabs, type TerminalTabs } from '../terminal/tabs'

export interface AppContextValue {
  api: Api
  session: Session
  // Branches, tags and recent commits, shared by every picker.
  refs: Refs
  // Staged and unstaged files, for the stage panel.
  stage: Stage
  settings: Store<Settings>
  reviews: Reviews
  viewed: Viewed
  // The file whose history the sidebar shows, or null for the branch history.
  fileHistory: Store<string | null>
  view: Store<View>
  graph: Graph
  // The commit open in the graph's side panel.
  graphSelection: Store<string | null>
  // What the graph's find box holds, so matching rows can stand out.
  graphQuery: Store<string>
  // Folders folded in the changes tree; their files fold in the diff too.
  changesFolders: Store<ReadonlySet<string>>
  // The file open in the Files view, the line it was opened at, and the commit it is read at (null: working tree).
  fileSelection: Store<string | null>
  fileLine: Store<number | null>
  fileAt: Store<string | null>
  // The name clicked in code, whose definitions and uses the symbol panel lists.
  symbol: Store<SymbolTarget | null>
  github: GitHub
  // The pull request and issue open in their views.
  pullSelection: Store<number | null>
  issueSelection: Store<number | null>
  // The open pull request's tab.
  pullTab: Store<PullTab>
  // The file last jumped to in the diff, so back and forward can return to it.
  diffFile: Store<string | null>
  // The conflicted file open in the merge editor.
  mergeFile: Store<string | null>
  // The file at the top of the diff as it scrolls, which the changes tree highlights.
  diffTop: Store<string | null>
  // The diffs open side by side above the viewer; the first is always the working tree.
  tabs: Tabs
  // Every pull request and issue, saved per repo, for the palette's search.
  items: ItemIndex
  // GitHub's review threads for the pull request the diff shows.
  pullReview: PullReview
  viewer: RefObject<DiffViewHandle | null>
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

export function AppProvider({ api, children }: { api?: Api; children: ReactNode }) {
  const viewer = useRef<DiffViewHandle | null>(null)
  const value = useMemo(() => {
    const client = api ?? createApi()
    const session = createSession(client, readTarget(window.location.search))
    return {
      api: client,
      session,
      refs: createRefs(client, session),
      stage: createStage(client, session),
      settings: createSettingsStore(),
      reviews: createReviews(client),
      viewed: createViewedStore(),
      fileHistory: createStore<string | null>(null),
      view: createStore<View>(readView(window.location.search)),
      graph: createGraph(client),
      graphSelection: createStore<string | null>(null),
      graphQuery: createStore(''),
      fileSelection: createStore<string | null>(null),
      fileLine: createStore<number | null>(null),
      fileAt: createStore<string | null>(null),
      symbol: createStore<SymbolTarget | null>(null),
      changesFolders: createStore<ReadonlySet<string>>(new Set()),
      github: createGitHub(client),
      pullSelection: createStore<number | null>(null),
      issueSelection: createStore<number | null>(null),
      pullTab: createStore<PullTab>('conversation'),
      diffFile: createStore<string | null>(null),
      mergeFile: createStore<string | null>(null),
      diffTop: createStore<string | null>(null),
      tabs: createTabs(readTarget(window.location.search)),
      pullReview: createPullReview(client),
      items: createItemIndex(client),
      viewer,
      jobs: createJobs(client),
      panel: createPanel(),
      terminalTabs: createTerminalTabs(client),
      keys: createKeyState(),
      keyOverrides: createKeyOverrides(),
    }
  }, [api])

  useEffect(() => {
    value.jobs.load().catch(() => {})
    value.terminalTabs.load().catch(() => {})
  }, [value])

  // Tabs are saved per repository, so they come back once the page knows which one it shows.
  useEffect(() => {
    value.api.repo().then(
      (info) => value.tabs.restore(info.root),
      () => {},
    )
  }, [value])

  useEffect(() => {
    // The highlighter starts with the page and loads the changed files' grammars while the diff is read,
    // so the first rows arrive colored.
    highlighter.warm([])
    // The diff is read first only when it is the page being opened; other views get their own data out
    // first and the diff follows once the page is idle.
    const loadDiff = () => void value.session.load(value.session.get().target)
    const opening = value.view.get()
    if (opening === 'changes') loadDiff()
    else {
      if (opening === 'graph') void value.graph.load()
      const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 300))
      idle(loadDiff, { timeout: 1500 })
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

  // The saved pull requests and issues show as soon as the repo is known, then refresh from GitHub.
  useEffect(() => {
    const { github, items } = value
    const sync = () => {
      const state = github.get()
      if (isReady(state) && state.status?.repo) items.open(state.status.repo)
    }
    sync()
    return github.subscribe(sync)
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
