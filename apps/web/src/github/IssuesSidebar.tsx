import type { IssueSummary } from '@duck-diff/protocol'
import { Button, Dialog, DialogContent, DialogFooter, DialogTitle, Input, Textarea } from '@duck-diff/ui'
import { CircleCheck, CircleDot, MessageSquare, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { ItemSidebar } from './ItemSidebar'
import { Labels } from './Labels'
import { ago } from './time'

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
      label="Issues"
      load={api.github.issues}
      selection={issueSelection}
      version={version}
      actions={<NewIssue onCreated={onChanged} />}
      row={(issue: IssueSummary) => (
        <>
          <span className="pt-1">
            <IssueIcon state={issue.state} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-foreground">{issue.title}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className="shrink-0">#{issue.number}</span>
              <span className="truncate">
                {issue.author.login} · {ago(issue.updatedAt)}
              </span>
              {issue.comments ? (
                <span className="ms-auto flex shrink-0 items-center gap-1">
                  <MessageSquare className="size-3.5" />
                  {issue.comments}
                </span>
              ) : null}
            </span>
            {issue.labels.length ? (
              <span className="flex gap-1 overflow-hidden">
                <Labels labels={issue.labels} max={2} />
              </span>
            ) : null}
          </span>
        </>
      )}
    />
  )
}
