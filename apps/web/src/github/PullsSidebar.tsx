import type { PullSummary } from '@duck-diff/protocol'
import { ContextMenuItem } from '@duck-diff/ui'
import { FileDiff, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { ItemSidebar } from './ItemSidebar'
import { Labels } from './Labels'
import { NewPull } from './NewPull'
import { ago } from './time'

export function PullIcon({ pull }: { pull: Pick<PullSummary, 'state' | 'merged' | 'draft'> }) {
  if (pull.merged) return <GitMerge aria-label="Merged" className="size-4 shrink-0 text-tn-magenta" />
  if (pull.state === 'closed')
    return <GitPullRequestClosed aria-label="Closed" className="size-4 shrink-0 text-removed" />
  if (pull.draft) return <GitPullRequestDraft aria-label="Draft" className="size-4 shrink-0 text-muted-foreground" />
  return <GitPullRequest aria-label="Open" className="size-4 shrink-0 text-added" />
}

export function PullsSidebar({ version, onChanged }: { version: number; onChanged(): void }) {
  const { api, pullSelection } = useApp()
  const { navigate } = useTarget()
  const { show } = useView()
  // The same fetch as the page's Review files: the head lands in a local ref, then the diff shows it.
  const reviewFiles = async (number: number) => {
    try {
      const refs = await api.github.fetchPull(number)
      navigate({ kind: 'range', from: refs.base, to: refs.head, mode: 'merge-base' })
      show('changes')
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  return (
    <ItemSidebar
      label="Pull requests"
      load={api.github.pulls}
      selection={pullSelection}
      version={version}
      actions={<NewPull onCreated={onChanged} />}
      menuFor={(pull: PullSummary) => (
        <ContextMenuItem onSelect={() => void reviewFiles(pull.number)}>
          <FileDiff />
          Review files
        </ContextMenuItem>
      )}
      row={(pull: PullSummary) => (
        <>
          <span className="pt-1">
            <PullIcon pull={pull} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-foreground">{pull.title}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className="shrink-0">#{pull.number}</span>
              <span className="truncate">
                {pull.author.login} · {ago(pull.updatedAt)}
              </span>
            </span>
            {pull.labels.length ? (
              <span className="flex gap-1 overflow-hidden">
                <Labels labels={pull.labels} max={2} />
              </span>
            ) : null}
          </span>
        </>
      )}
    />
  )
}
