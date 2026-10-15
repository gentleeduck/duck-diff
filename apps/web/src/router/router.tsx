import { createRootRoute, createRoute, createRouter, type RouterHistory } from '@tanstack/react-router'
import { type ComponentType, createElement, lazy, memo } from 'react'
import type { View } from './place'

// Memoized: the page around them re-renders for panels and badges, which these big views do not need.
const Changes = lazy(() => import('../viewer/ChangesPage'))
const GraphView = lazy(() => import('../graph/GraphView').then((module) => ({ default: memo(module.default) })))
const MergeEditor = lazy(() => import('../merge/MergeEditor'))
const FileView = lazy(() => import('../files/FileView').then((module) => ({ default: memo(module.default) })))
const Insights = lazy(() => import('../insights/Insights'))
// GitHub pages load when first opened, keeping them out of the bundle every view waits for.
const pages = () => import('../github/Pages')
const page = (name: keyof Awaited<ReturnType<typeof pages>>) =>
  lazy(() => pages().then((module) => ({ default: module[name] as ComponentType })))

const MAINS: Record<View, ComponentType> = {
  changes: Changes,
  graph: GraphView,
  files: FileView,
  prs: page('PullsPage'),
  issues: page('IssuesPage'),
  inbox: page('InboxPage'),
  releases: page('ReleasesPage'),
  actions: page('ActionsPage'),
  discussions: page('DiscussionsPage'),
  security: page('SecurityPage'),
  insights: Insights,
  merge: MergeEditor,
}

// Search params stay plain strings, as the Neovim plugin and older links write them; place.ts reads them.
const parseSearch = (search: string) => Object.fromEntries(new URLSearchParams(search))
const stringifySearch = (search: Record<string, unknown>) => {
  const query = new URLSearchParams(search as Record<string, string>).toString()
  return query ? `?${query}` : ''
}

// One route per view, plus one per pull request and issue; the shell around them is the root.
export function createAppRouter(history: RouterHistory, Root: ComponentType) {
  const root = createRootRoute({ component: () => createElement(Root) })
  const routes = (Object.keys(MAINS) as View[]).map((view) =>
    createRoute({
      getParentRoute: () => root,
      path: `/${view}`,
      component: () => createElement(MAINS[view]),
      staticData: { view },
    }),
  )
  const items = (['prs', 'issues'] as const).map((view) =>
    createRoute({
      getParentRoute: () => root,
      path: `/${view}/$number`,
      component: () => createElement(MAINS[view]),
      staticData: { view },
    }),
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
