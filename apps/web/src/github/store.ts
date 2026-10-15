import type { GitHubStatus } from '@duck-diff/protocol'

export interface GitHubState {
  status: GitHubStatus | null
  loading: boolean
  error: string | null
}

// Signed in and pointed at a GitHub repo: the only state where lists can load.
export const isReady = (state: GitHubState) => Boolean(state.status?.repo && state.status.user)
