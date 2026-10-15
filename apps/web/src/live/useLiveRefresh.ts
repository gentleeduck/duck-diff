import type { RepoInfo } from '@duck-diff/protocol'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { connectEvents, type EventsStatus } from '../lib/events'
import { pushUrl } from '../lib/history'
import { writeTarget } from '../lib/target-url'
import { invalidateTopic, topicsOf, watchedTopics } from '../query/client'
import { createRefresher } from './refresher'
import { setQueryTopics, setTopicSender } from './topics'

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
  const { api, session, reviews, refs, jobs } = useApp()
  const [state, setState] = useState<LiveState>({ status: 'connecting', repo: null })
  const client = useQueryClient()

  // The server polls GitHub only for what some page on screen follows.
  useEffect(() => {
    const update = () => setQueryTopics(watchedTopics(client))
    update()
    return client.getQueryCache().subscribe(update)
  }, [client])

  useEffect(() => {
    const refresher = createRefresher(() => session.reload())
    let build: string | undefined
    let dropped = false
    const dispose = connectEvents({
      url: eventsUrl(),
      onStatus: (status) => {
        setState((prev) => ({ ...prev, status }))
        if (status === 'closed') dropped = true
        if (status !== 'open') setTopicSender(null)
      },
      onOpen: (sender) => {
        // Events sent while the socket was down are lost; whatever follows one is read again.
        if (dropped) void client.invalidateQueries({ predicate: (query) => topicsOf(query).length > 0 })
        dropped = false
        setTopicSender(sender)
      },
      onEvent: (event) => {
        if (event.type === 'hello') {
          // A new server build took over on the same port; the page it serves is new too.
          if (event.build && build && event.build !== build) return window.location.reload()
          build = event.build ?? build
          // Actions that ran while the page was away still show.
          jobs.load().catch(() => {})
          return setState((prev) => ({ ...prev, repo: event.repo }))
        }
        if (event.type === 'github') return void invalidateTopic(client, event.topic)
        if (event.type === 'job' || event.type === 'job-output') return jobs.apply(event)
        if (event.type === 'navigate') {
          pushUrl(writeTarget(event.target, window.location.search))
          void session.load(event.target)
          window.focus()
          return
        }
        // A save is a working tree change; every other reason names the reads it makes stale.
        void invalidateTopic(client, event.reason === 'saved' ? 'worktree' : event.reason)
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
  }, [api, session, reviews, refs, jobs, client])

  return state
}
