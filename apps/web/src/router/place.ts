import { type DiffTarget, DiffTargetSchema, targetKey } from '@duck-diff/protocol'

export const VIEWS = [
  'changes',
  'graph',
  'files',
  'prs',
  'issues',
  'inbox',
  'releases',
  'actions',
  'discussions',
  'security',
  'insights',
  'merge',
] as const
export type View = (typeof VIEWS)[number]

export const PULL_TABS = ['conversation', 'commits', 'checks', 'files'] as const
export type PullTab = (typeof PULL_TABS)[number]

export const DEFAULT_TARGET: DiffTarget = { kind: 'local' }

// Everything the url says: the view, what is open in it, and the comparison the diff shows (kept across views).
export interface Place {
  view: View
  // The pull request or issue open in prs or issues.
  number: number | null
  tab: PullTab
  // The file open in files, at a line and a ref.
  file: string | null
  line: number | null
  at: string | null
  // The commit selected in the graph.
  commit: string | null
  // The file the diff is at (changes, prs) or the conflict open (merge).
  path: string | null
  target: DiffTarget
}

const positive = (raw: string | null | undefined) => {
  const value = Number(raw)
  return raw && Number.isInteger(value) && value > 0 ? value : null
}

function readTarget(raw: string | null): DiffTarget {
  if (!raw) return DEFAULT_TARGET
  try {
    return DiffTargetSchema.parse(JSON.parse(raw))
  } catch {
    return DEFAULT_TARGET
  }
}

// Paths are /view or /view/number; links from before the router said ?view= and ?number= on /.
export function readPlace(pathname: string, search: string): Place {
  const params = new URLSearchParams(search)
  const [first, second] = pathname.split('/').filter(Boolean)
  const named = VIEWS.find((view) => view === first) ?? VIEWS.find((view) => view === params.get('view'))
  const view = named ?? 'changes'
  const numbered = view === 'prs' || view === 'issues'
  return {
    view,
    number: numbered ? positive(second ?? params.get('number')) : null,
    tab: PULL_TABS.find((tab) => tab === params.get('tab')) ?? 'conversation',
    file: params.get('file') || null,
    line: positive(params.get('line')),
    at: params.get('at') || null,
    commit: params.get('commit') || null,
    path: params.get('path') || null,
    target: readTarget(params.get('target')),
  }
}

export function hrefOf(place: Place): string {
  const params = new URLSearchParams()
  const set = (name: string, value: string | number | null) => {
    if (value !== null) params.set(name, String(value))
  }
  let path = `/${place.view}`
  switch (place.view) {
    case 'changes':
      set('path', place.path)
      break
    case 'prs':
      if (place.number !== null) {
        path += `/${place.number}`
        set('tab', place.tab === 'conversation' ? null : place.tab)
        set('path', place.path)
      }
      break
    case 'issues':
      if (place.number !== null) path += `/${place.number}`
      break
    case 'files':
      set('file', place.file)
      set('line', place.line)
      set('at', place.at)
      break
    case 'graph':
      set('commit', place.commit)
      break
    case 'merge':
      set('path', place.path)
      break
  }
  if (targetKey(place.target) !== targetKey(DEFAULT_TARGET)) params.set('target', JSON.stringify(place.target))
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
