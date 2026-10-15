import { createRootRoute, createRoute, createRouter, type RouterHistory } from '@tanstack/react-router'
import { type ComponentType, createElement, lazy, memo } from 'react'
import FileViewPage from '../files/FileView'
import {
  ActionsPage,
  DiscussionsPage,
  InboxPage,
  IssuesPage,
  PullsPage,
  ReleasesPage,
  SecurityPage,
} from '../github/Pages'
import GraphViewPage from '../graph/GraphView'
import MergeEditor from '../merge/MergeEditor'
import Changes from '../viewer/ChangesPage'
import type { View } from './place'

// Views come in the main bundle: served from this machine, a chain of lazy chunks costs more than the bytes.
// Only the charts wait, being big and rarely the first thing opened.
const Insights = lazy(() => import('../insights/Insights'))
// Memoized: the page around them re-renders for panels and badges, which these big views do not need.
const GraphView = memo(GraphViewPage)
const FileView = memo(FileViewPage)

export const MAINS: Record<View, ComponentType> = {
  changes: Changes,
  graph: GraphView,
  files: FileView,
  prs: PullsPage,
  issues: IssuesPage,
  inbox: InboxPage,
  releases: ReleasesPage,
  actions: ActionsPage,
  discussions: DiscussionsPage,
  security: SecurityPage,
  insights: Insights,
  merge: MergeEditor,
}

// Search params stay plain strings, as the Neovim plugin and older links write them; place.ts reads them.
const parseSearch = (search: string) => Object.fromEntries(new URLSearchParams(search))
const stringifySearch = (search: Record<string, unknown>) => {
  const query = new URLSearchParams(search as Record<string, string>).toString()
  return query ? `?${query}` : ''
}

// One route per view, plus one per pull request and issue; the shell around them is the root, and it keeps
// every view seen alive (ViewStack) so switching back is instant. Routes give the url its shape.
export function createAppRouter(history: RouterHistory, Root: ComponentType) {
  const root = createRootRoute({ component: () => createElement(Root) })
  const routes = (Object.keys(MAINS) as View[]).map((view) =>
    createRoute({ getParentRoute: () => root, path: `/${view}`, staticData: { view } }),
  )
  const items = (['prs', 'issues'] as const).map((view) =>
    createRoute({ getParentRoute: () => root, path: `/${view}/$number`, staticData: { view } }),
  )
  return createRouter({
    routeTree: root.addChildren([...routes, ...items]),
    history,
    parseSearch,
    stringifySearch,
    // The page's own scroll memory (hooks/useScrollMemory) puts every container back.
    scrollRestoration: false,
  })
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    view?: View
  }
}
