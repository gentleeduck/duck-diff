import { Button, Input, Kbd } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { ViewSkeleton } from '../app/skeletons'
import { useView } from '../hooks/useView'
import { useStore } from '../lib/store'
import type { Place } from '../router/place'
import { type GitHubState, isReady } from './store'

const selectNumber = (place: Place) => place.number

export function useGitHub(): GitHubState {
  const { queries } = useApp()
  const { data, isFetching, error } = useQuery(queries.gh.status())
  return { status: data ?? null, loading: isFetching, error: error ? error.message : null }
}

// Signing in answers with the new status; checking again reads it fresh.
function useSignIn() {
  const { api, queries, queryClient } = useApp()
  const key = queries.gh.status().queryKey
  return {
    signIn: (token: string) =>
      api.github.signIn(token).then(
        (status) => queryClient.setQueryData(key, status),
        () => queryClient.invalidateQueries({ queryKey: key }),
      ),
    check: () => queryClient.invalidateQueries({ queryKey: key }),
  }
}

function SignInPanel({ state }: { state: GitHubState }) {
  const github = useSignIn()
  const [token, setToken] = useState('')
  const noRemote = state.status !== null && state.status.repo === null

  if (noRemote) {
    return (
      <div className="flex max-w-lg flex-col gap-2">
        <h2 className="text-foreground">No GitHub remote</h2>
        <p className="text-muted-foreground">
          This repository has no <code className="text-tn-cyan">origin</code> on github.com, so there are no pull
          requests or issues to show.
        </p>
      </div>
    )
  }

  return (
    <form
      className="flex max-w-lg flex-col gap-3"
      aria-label="Sign in to GitHub"
      onSubmit={(event) => {
        event.preventDefault()
        if (token.trim()) void github.signIn(token.trim())
      }}>
      <h2 className="flex items-center gap-2 text-foreground">
        <span aria-hidden="true"></span>
        Sign in to GitHub
      </h2>
      <p className="text-muted-foreground">
        duck-diff uses the GitHub CLI's login. Run <Kbd>gh auth login</Kbd> in a terminal, then check again.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        loading={state.loading}
        onClick={() => void github.check()}>
        <RefreshCw />
        Check again
      </Button>
      <p className="text-muted-foreground">Or paste a personal access token. It stays in this server's memory.</p>
      <div className="flex gap-2">
        <Input
          type="password"
          aria-label="GitHub token"
          placeholder="ghp_..."
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={token.trim().length < 10 || state.loading}>
          Sign in
        </Button>
      </div>
      {state.error ? <p className="text-removed">{state.error}</p> : null}
    </form>
  )
}

// Shows the children once signed in to the repo's GitHub, and the way to get there otherwise.
export function GitHubGate({ children }: { children: ReactNode }) {
  const state = useGitHub()
  const { view } = useView()
  const item = useStore(useApp().place, selectNumber) !== null
  if (isReady(state)) return children
  // No answer yet (still reading, or restoring the saved one): the page's own shape, not the sign-in form.
  if (!state.status && !state.error) return <ViewSkeleton view={view} item={item} />
  return (
    <div className="p-6">
      <SignInPanel state={state} />
    </div>
  )
}
