import { lazy } from 'react'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import { useRefresh } from '../query/useRefresh'
import { Actions } from './Actions'
import { Discussions } from './Discussions'
import { Inbox } from './Inbox'
import { IssuesList } from './IssuesList'
import { PullsList } from './PullsList'
import { Releases } from './Releases'
import { Security } from './Security'
import { GitHubGate } from './SignIn'

const PullView = lazy(() => import('./PullView'))
const IssueView = lazy(() => import('./IssueView'))

const selectNumber = (value: number | null) => value

// Like GitHub: the list is a page, and an item opens as its own page with nothing beside it.
export function PullsPage() {
  const { pullSelection } = useApp()
  const refresh = useRefresh()
  // A change made here is a change the lists and the palette's index should see too.
  const onChanged = () => void refresh('pulls')
  const number = useStore(pullSelection, selectNumber)
  return (
    <GitHubGate>
      {number === null ? (
        <PullsList onChanged={onChanged} />
      ) : (
        <PullView key={number} number={number} onChanged={onChanged} />
      )}
    </GitHubGate>
  )
}

export function IssuesPage() {
  const { issueSelection } = useApp()
  const refresh = useRefresh()
  const onChanged = () => void refresh('issues')
  const number = useStore(issueSelection, selectNumber)
  return (
    <GitHubGate>
      {number === null ? (
        <IssuesList onChanged={onChanged} />
      ) : (
        <IssueView key={number} number={number} onChanged={onChanged} />
      )}
    </GitHubGate>
  )
}

export function InboxPage() {
  return (
    <GitHubGate>
      <Inbox />
    </GitHubGate>
  )
}

export function ReleasesPage() {
  return (
    <GitHubGate>
      <Releases />
    </GitHubGate>
  )
}

export function ActionsPage() {
  return (
    <GitHubGate>
      <Actions />
    </GitHubGate>
  )
}

export function DiscussionsPage() {
  return (
    <GitHubGate>
      <Discussions />
    </GitHubGate>
  )
}

export function SecurityPage() {
  return (
    <GitHubGate>
      <Security />
    </GitHubGate>
  )
}
