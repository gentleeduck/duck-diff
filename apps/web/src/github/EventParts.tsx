import type { EventPart } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import type { ReactNode } from 'react'
import { useApp } from '../app/AppProvider'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { LabelBadge } from './Labels'
import { useGitHub } from './SignIn'

const LINK = 'cursor-pointer text-foreground hover:text-tn-blue hover:underline'

// A person's GitHub profile, in a new tab as GitHub's own links open from here.
export function UserLink({ login, className = LINK }: { login: string; className?: string }) {
  return (
    <a href={`https://github.com/${login}`} target="_blank" rel="noreferrer" className={className}>
      {login}
    </a>
  )
}

// A commit opens its diff in the changes view.
export function CommitLink({
  sha,
  children,
  className = LINK,
}: {
  sha: string
  children: ReactNode
  className?: string
}) {
  const { navigate } = useTarget()
  const { show } = useView()
  return (
    <Button
      variant="nothing"
      size="none"
      type="button"
      title={`Show commit ${sha.slice(0, 7)}`}
      className={`${className} text-start justify-start rounded-none`}
      onClick={() => {
        navigate({ kind: 'commit', sha })
        show('changes')
      }}>
      {children}
    </Button>
  )
}

function ItemLink({ part }: { part: Extract<EventPart, { kind: 'item' }> }) {
  const { pullSelection, issueSelection } = useApp()
  const here = useGitHub().status?.repo ?? null
  const label = (
    <>
      <span className="text-tn-comment">#{part.number}</span> {part.title}
    </>
  )
  // Items in another repo live on GitHub; ours open in the page.
  if (part.repo && part.repo !== here)
    return (
      <a href={part.url} target="_blank" rel="noreferrer" className={LINK}>
        {part.repo}
        {label}
      </a>
    )
  return (
    <Button
      variant="nothing"
      size="none"
      type="button"
      className={`${LINK} text-start justify-start rounded-none`}
      onClick={() => (part.pull ? pullSelection : issueSelection).set(part.number)}>
      {label}
    </Button>
  )
}

export function EventParts({ parts }: { parts: EventPart[] }) {
  return parts.map((part, index) => {
    const key = `${index}:${part.kind}`
    if (part.kind === 'text') return <span key={key}>{part.text}</span>
    if (part.kind === 'user') return <UserLink key={key} login={part.login} />
    if (part.kind === 'item') return <ItemLink key={key} part={part} />
    if (part.kind === 'label')
      return (
        <span key={key} className="inline-flex align-middle">
          <LabelBadge label={{ name: part.name, color: part.color }} />
        </span>
      )
    return (
      <CommitLink key={key} sha={part.sha} className={`${LINK} text-tn-comment`}>
        {part.sha.slice(0, 7)}
      </CommitLink>
    )
  })
}
