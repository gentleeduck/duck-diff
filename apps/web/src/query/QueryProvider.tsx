import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { type ReactNode, useState } from 'react'
import { createQueryClient, persistKey, type QueryMeta } from './client'

// Bumped when a persisted answer's shape changes, so an older copy is dropped rather than misread.
const BUSTER = '1'
const DAY_MS = 24 * 60 * 60_000

// persist: the real page keeps its GitHub and commit answers in localStorage, so a reload paints from them
// while they are read again. Tests leave it off and each start empty.
export function QueryProvider({ persist = false, children }: { persist?: boolean; children: ReactNode }) {
  const [client] = useState(createQueryClient)
  const [persister] = useState(() => {
    const key = persist && typeof localStorage !== 'undefined' ? persistKey(document.cookie, location.port) : null
    return key ? createSyncStoragePersister({ storage: localStorage, key, throttleTime: 2000 }) : null
  })
  if (!persister) return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return (
    <PersistQueryClientProvider
      client={client}
      // Restored answers paint at once and are read again behind them.
      onSuccess={() => void client.invalidateQueries()}
      persistOptions={{
        persister,
        maxAge: DAY_MS,
        buster: BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === 'success' && Boolean((query.meta as QueryMeta | undefined)?.persist),
        },
      }}>
      {children}
    </PersistQueryClientProvider>
  )
}
