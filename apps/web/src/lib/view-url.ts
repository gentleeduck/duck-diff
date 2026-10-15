export const VIEWS = ['changes', 'graph', 'files', 'prs', 'issues', 'inbox', 'releases', 'actions', 'merge'] as const
export type View = (typeof VIEWS)[number]

export const PULL_TABS = ['conversation', 'commits', 'checks', 'files'] as const
export type PullTab = (typeof PULL_TABS)[number]

export function readView(search: string): View {
  const raw = new URLSearchParams(search).get('view')
  return VIEWS.find((view) => view === raw) ?? 'changes'
}

// Changes is the default, so it keeps the url free of a view param.
export function writeView(view: View, search: string): string {
  const params = new URLSearchParams(search)
  if (view === 'changes') params.delete('view')
  else params.set('view', view)
  const query = params.toString()
  return query ? `?${query}` : '?'
}
