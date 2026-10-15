import type { RepoInfo } from '@duck-diff/protocol'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { connectEvents, type EventsStatus } from '../lib/events'
import { writeTarget } from '../lib/target-url'
import { createRefresher } from './refresher'

export interface LiveState {
  status: EventsStatus
  repo: RepoInfo | null
}

function eventsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/events`
}

// Keeps the page in step with the repo: every change the server reports becomes one coalesced reload.
export function useLiveRefresh(): LiveState {
  const { api, session, reviews, refs } = useApp()
  const [state, setState] = useState<LiveState>({ status: 'connecting', repo: null })

  useEffect(() => {
    const refresher = createRefresher(() => session.reload())
    const dispose = connectEvents({
      url: eventsUrl(),
      onStatus: (status) => setState((prev) => ({ ...prev, status })),
      onEvent: (event) => {
        if (event.type === 'hello') return setState((prev) => ({ ...prev, repo: event.repo }))
        if (event.type === 'navigate') {
          window.history.pushState(null, '', writeTarget(event.target, window.location.search))
          void session.load(event.target)
          window.focus()
          return
        }
        if (event.reason === 'reviews') return void reviews.reload().catch(() => {})
        refresher.notify()
        if (event.reason === 'refs') {
          void refs.reload()
          api.repo().then(
            (repo) => setState((prev) => ({ ...prev, repo })),
            () => {},
          )
        }
      },
    })
    return () => {
      refresher.dispose()
      dispose()
    }
  }, [api, session, reviews, refs])

  return state
}
