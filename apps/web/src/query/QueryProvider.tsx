import { hydrate, QueryClientProvider } from '@tanstack/react-query'
import { type PersistedClient, persistQueryClientSubscribe } from '@tanstack/react-query-persist-client'
import { type ReactNode, useEffect, useState } from 'react'
import { whenIdle } from '../lib/idle'
import { onServer } from '../lib/saved'
import { createQueryClient, type QueryMeta } from './client'
import { pagePersister } from './persister'

// Bumped when a persisted answer's shape changes, so an older copy is dropped rather than misread.
const BUSTER = '1'
const DAY_MS = 24 * 60 * 60_000

// The answers saved last time, which the server put into the page.
function savedAnswers(): PersistedClient | null {
  const script = typeof document === 'undefined' ? null : document.getElementById('duck-diff-queries')
  if (!script?.textContent) return null
  try {
    const saved = JSON.parse(script.textContent) as PersistedClient
    return saved.buster === BUSTER && Date.now() - saved.timestamp < DAY_MS ? saved : null
  } catch {
    return null
  }
}

const dehydrateOptions = {
  shouldDehydrateQuery: (query: { state: { status: string }; meta?: unknown }) =>
    query.state.status === 'success' && Boolean((query.meta as QueryMeta | undefined)?.persist),
}

// persist: the real page starts with the answers it had last time, put into the cache before the first
// render so it paints from them at once, and reads them again behind them. Tests leave it off.
export function QueryProvider({ persist = false, children }: { persist?: boolean; children: ReactNode }) {
  const save = persist && onServer
  const [client] = useState(() => {
    const created = createQueryClient()
    const saved = save ? savedAnswers() : null
    if (saved) {
      hydrate(created, saved.clientState)
      // Read again once the page has drawn, behind what it opened with.
      whenIdle(() => void created.invalidateQueries())
    }
    return created
  })
  useEffect(() => {
    if (!save) return
    return persistQueryClientSubscribe({
      queryClient: client,
      persister: pagePersister(),
      buster: BUSTER,
      dehydrateOptions,
    })
  }, [client, save])
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
