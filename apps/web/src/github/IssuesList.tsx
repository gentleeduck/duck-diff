import type { IssueSummary } from '@duck-diff/protocol'
import { ContextMenuItem } from '@duck-diff/ui'
import { CircleCheck, CircleDot } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ItemList } from './ItemList'
import { ListRow } from './ListRow'
import { NewIssue } from './NewIssue'

export function IssueIcon({ state }: { state: IssueSummary['state'] }) {
  return state === 'open' ? (
    <CircleDot aria-label="Open" className="size-4 shrink-0 text-added" />
  ) : (
    <CircleCheck aria-label="Closed" className="size-4 shrink-0 text-tn-magenta" />
  )
}

export function IssuesList({ onChanged }: { onChanged(): void }) {
  const { api, issueSelection } = useApp()
  return (
    <ItemList
      kind="issue"
      label="Issues"
      selection={issueSelection}
      actions={<NewIssue onCreated={onChanged} />}
      menuFor={(issue, reload) => (
        <ContextMenuItem
          onSelect={async () => {
            const next = issue.state === 'open' ? 'closed' : 'open'
            try {
              await api.github.setIssueState(issue.number, next)
              toast(next === 'closed' ? `Closed #${issue.number}` : `Reopened #${issue.number}`)
              reload()
              onChanged()
            } catch (error) {
              toast.error((error as Error).message)
            }
          }}>
          {issue.state === 'open' ? <CircleCheck /> : <CircleDot />}
          {issue.state === 'open' ? 'Close issue' : 'Reopen issue'}
        </ContextMenuItem>
      )}
      row={(issue) => <ListRow item={issue} kind="issue" />}
    />
  )
}
