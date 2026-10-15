import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@duck-diff/ui'
import { GitPullRequestCreateArrow } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { useGit } from '../git/GitProvider'
import { useRefs } from '../hooks/useRefs'
import { VISIBLE_BOX } from '../viewer/FileActions'

export function NewPull({ onCreated }: { onCreated(): void }) {
  const { api, pullSelection } = useApp()
  const { status, run } = useGit()
  const { refs } = useRefs()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [base, setBase] = useState('')
  const [draft, setDraft] = useState(false)
  const [sending, setSending] = useState(false)
  const draftId = useId()
  const head = status?.branch ?? null
  const branches = refs.filter((ref) => ref.kind === 'branch' && ref.name !== head).map((ref) => ref.name)

  // The title starts as the branch's latest commit, and the base as the repo's default branch.
  useEffect(() => {
    if (!open) return
    api.commits({ head: 'HEAD', limit: 1 }).then(
      ([latest]) => setTitle((prev) => prev || latest?.subject || ''),
      () => {},
    )
    api.github.defaultBranch().then(
      (branch) => setBase((prev) => prev || branch),
      () => {},
    )
  }, [open, api])

  const create = async () => {
    if (!head) return
    setSending(true)
    try {
      // GitHub can only open a pull request for commits it has.
      if (!status?.upstream || (status.ahead ?? 0) > 0) {
        if (!(await run('push', undefined, `Pushed ${head}`))) return
      }
      const pull = await api.github.createPull({ title: title.trim(), body, head, base, draft })
      toast(`Opened #${pull.number}`)
      setOpen(false)
      setTitle('')
      setBody('')
      onCreated()
      pullSelection.set(pull.number)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <GitPullRequestCreateArrow />
        New pull request
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>New pull request</DialogTitle>
          {head ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (title.trim() && base) void create()
              }}>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span>Merge</span>
                <code className="text-tn-cyan">{head}</code>
                <span>into</span>
                <Select value={base} onValueChange={(value: string) => value && setBase(value)}>
                  <SelectTrigger aria-label="Base branch" className="h-7 w-48">
                    <SelectValue placeholder="Base branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([base, ...branches].filter(Boolean))].map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                aria-label="Title"
                placeholder="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <Textarea
                aria-label="Description"
                placeholder="What changes and why"
                rows={8}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id={draftId}
                  checked={draft}
                  onCheckedChange={(next) => setDraft(next === true)}
                  className={VISIBLE_BOX}
                />
                <Label htmlFor={draftId}>Open as a draft</Label>
              </div>
              <DialogFooter>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!title.trim() || !base} loading={sending}>
                  Open pull request
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <p className="text-muted-foreground">
              HEAD is detached. Switch to a branch to open a pull request from it.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
