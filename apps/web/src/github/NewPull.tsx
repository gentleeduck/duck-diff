import type { Commit } from '@duck-diff/protocol'
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
} from '@duck-diff/ui'
import { GitPullRequestCreateArrow } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { useGit } from '../git/GitProvider'
import { useRefs } from '../hooks/useRefs'
import { VISIBLE_BOX } from '../viewer/FileActions'
import { Avatar } from './Conversation'
import { MarkdownEditor } from './MarkdownEditor'
import { Picker } from './Picker'
import { options } from './SidebarEditors'

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
  const [reviewers, setReviewers] = useState<string[]>([])
  const [labels, setLabels] = useState<string[]>([])
  const [assignees, setAssignees] = useState<string[]>([])
  const [preview, setPreview] = useState<{ commits: Commit[]; files: number } | null>(null)
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
    // The repo's pull request template, when it has one, starts the description.
    api.github.templates().then(
      (templates) => templates.pull && setBody((prev) => prev || (templates.pull ?? '')),
      () => {},
    )
  }, [open, api])

  // What GitHub's compare page shows before opening: the commits and files the pull request will carry.
  useEffect(() => {
    if (!open || !base || !head) return
    let alive = true
    const from = refs.some((ref) => ref.name === `origin/${base}`) ? `origin/${base}` : base
    Promise.all([
      api.commits({ head, base: from, limit: 100 }),
      api.files({ kind: 'range', from, to: head, mode: 'merge-base' }),
    ]).then(
      ([commits, files]) => alive && setPreview({ commits, files: files.length }),
      () => alive && setPreview(null),
    )
    return () => {
      alive = false
    }
  }, [open, base, head, api, refs])

  const create = async () => {
    if (!head) return
    setSending(true)
    try {
      // GitHub can only open a pull request for commits it has.
      if (!status?.upstream || (status.ahead ?? 0) > 0) {
        if (!(await run('push', undefined, `Pushed ${head}`))) return
      }
      const pull = await api.github.createPull({
        title: title.trim(),
        body,
        head,
        base,
        draft,
        reviewers,
        labels,
        assignees,
      })
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
              <MarkdownEditor label="Description" value={body} onChange={setBody} rows={8} />
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ['Reviewers', reviewers, setReviewers, 'people'],
                    ['Assignees', assignees, setAssignees, 'people'],
                    ['Labels', labels, setLabels, 'labels'],
                  ] as const
                ).map(([title, chosen, set, kind]) => (
                  <div key={title} className="flex flex-col gap-1">
                    <span className="flex items-center justify-between text-muted-foreground">
                      {title}
                      <Picker
                        title={title}
                        selected={chosen}
                        onApply={set}
                        load={async () => {
                          const found = await options(api)
                          return kind === 'people'
                            ? found.people.map((user) => ({
                                value: user.login,
                                label: user.login,
                                icon: <Avatar user={user} />,
                              }))
                            : found.labels.map((label) => ({
                                value: label.name,
                                label: label.name,
                                icon: (
                                  <span className="size-3 rounded-full" style={{ background: `#${label.color}` }} />
                                ),
                              }))
                        }}
                      />
                    </span>
                    <span className="text-foreground">{chosen.length ? chosen.join(', ') : 'None'}</span>
                  </div>
                ))}
              </div>
              {preview ? (
                <section aria-label="What it carries" className="rounded-md border border-border">
                  <p className="border-border border-b bg-card px-3 py-1.5 text-muted-foreground">
                    {preview.commits.length} {preview.commits.length === 1 ? 'commit' : 'commits'}, {preview.files}{' '}
                    {preview.files === 1 ? 'file' : 'files'} changed
                  </p>
                  <ul className="max-h-40 overflow-y-auto">
                    {preview.commits.map((commit) => (
                      <li key={commit.sha} className="flex gap-2 px-3 py-1">
                        <span className="text-tn-comment">{commit.sha.slice(0, 7)}</span>
                        <span className="min-w-0 truncate text-foreground">{commit.subject}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
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
