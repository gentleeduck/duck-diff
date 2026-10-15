export const VIEWS = ['changes', 'graph', 'files', 'prs', 'issues'] as const
export type View = (typeof VIEWS)[number]

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

// The open pull request or issue, so its page has a url and the back button returns to the list.
export function readNumber(search: string): number | null {
  const raw = Number(new URLSearchParams(search).get('number'))
  return Number.isInteger(raw) && raw > 0 ? raw : null
}

export function writeNumber(number: number | null, search: string): string {
  const params = new URLSearchParams(search)
  if (number === null) params.delete('number')
  else params.set('number', String(number))
  const query = params.toString()
  return query ? `?${query}` : '?'
}
