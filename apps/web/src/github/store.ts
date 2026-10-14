import type { GitHubStatus } from '@duck-diff/protocol'
import type { Api } from '../lib/api'
import { createStore, type Store } from '../lib/store'

export interface GitHubState {
  status: GitHubStatus | null
  loading: boolean
  error: string | null
}

export interface GitHub extends Store<GitHubState> {
  // Reads the status once; later calls reuse it unless forced.
  load(force?: boolean): Promise<void>
  signIn(token: string): Promise<void>
}

export function createGitHub(api: Api): GitHub {
  const store = createStore<GitHubState>({ status: null, loading: false, error: null })
  let pending: Promise<void> | null = null

  async function settle(read: () => Promise<GitHubStatus>) {
    store.set((state) => ({ ...state, loading: true, error: null }))
    try {
      store.set({ status: await read(), loading: false, error: null })
    } catch (error) {
      store.set((state) => ({ ...state, loading: false, error: (error as Error).message }))
    }
  }

  return {
    ...store,
    load(force = false) {
      if (!force && (pending || store.get().status)) return pending ?? Promise.resolve()
      pending = settle(() => api.github.status()).finally(() => {
        pending = null
      })
      return pending
    },
    signIn: (token) => settle(() => api.github.signIn(token)),
  }
}

// Signed in and pointed at a GitHub repo: the only state where lists can load.
export const isReady = (state: GitHubState) => Boolean(state.status?.repo && state.status.user)
