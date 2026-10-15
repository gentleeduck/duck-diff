import type { IssueSummary } from '@duck-diff/protocol'
import {
  Button,
  ContextMenuItem,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Input,
  Textarea,
} from '@duck-diff/ui'
import { CircleCheck, CircleDot, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { ItemSidebar } from './ItemSidebar'
import { ListRow } from './ListRow'

export function IssueIcon({ state }: { state: IssueSummary['state'] }) {
  return state === 'open' ? (
    <CircleDot aria-label="Open" className="size-4 shrink-0 text-added" />
  ) : (
    <CircleCheck aria-label="Closed" className="size-4 shrink-0 text-tn-magenta" />
  )
}

function NewIssue({ onCreated }: { onCreated(): void }) {
  const { api, issueSelection } = useApp()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const create = async () => {
    setSending(true)
    try {
      const issue = await api.github.createIssue(title.trim(), body)
      toast(`Opened #${issue.number}`)
      setOpen(false)
      setTitle('')
      setBody('')
      onCreated()
      issueSelection.set(issue.number)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <IconTool label="New issue" onClick={() => setOpen(true)}>
        <Plus />
      </IconTool>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>New issue</DialogTitle>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (title.trim()) void create()
            }}>
            <Input
              aria-label="Title"
              placeholder="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Textarea
              aria-label="Description"
              placeholder="Describe the problem or idea"
              rows={8}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <DialogFooter>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!title.trim()} loading={sending}>
                Open issue
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function IssuesSidebar({ version, onChanged }: { version: number; onChanged(): void }) {
  const { api, issueSelection } = useApp()
  return (
    <ItemSidebar
      kind="issue"
      label="Issues"
      selection={issueSelection}
      version={version}
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
