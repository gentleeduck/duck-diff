import type { PullDetails } from '@duck-diff/protocol'
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from '@duck-diff/ui'
import { Check, FileDiff, GitMerge, SquareArrowOutUpRight, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import type { MergeMethod, ReviewEvent } from '../lib/api'
import { useStore } from '../lib/store'
import { Checks } from './Checks'
import { Avatar, Comment, Composer } from './Conversation'
import { Labels } from './Labels'
import { PullIcon } from './PullsSidebar'
import { GitHubGate } from './SignIn'
import { ago } from './time'

const selectNumber = (value: number | null) => value

const MERGE_METHODS: { value: MergeMethod; label: string }[] = [
  { value: 'squash', label: 'Squash and merge' },
  { value: 'merge', label: 'Create a merge commit' },
  { value: 'rebase', label: 'Rebase and merge' },
]

function stateLabel(pull: PullDetails) {
  if (pull.merged) return { text: 'Merged', className: 'border-tn-magenta/40 bg-tn-magenta/15 text-tn-magenta' }
  if (pull.state === 'closed') return { text: 'Closed', className: 'border-removed/40 bg-removed/15 text-removed' }
  if (pull.draft) return { text: 'Draft', className: 'text-muted-foreground' }
  return { text: 'Open', className: 'border-added/40 bg-added/15 text-added' }
}

function Pull({ number, onChanged }: { number: number; onChanged(): void }) {
  const { api } = useApp()
  const { navigate } = useTarget()
  const { show } = useView()
  const [pull, setPull] = useState<PullDetails | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [method, setMethod] = useState<MergeMethod>('squash')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(
    (alive: () => boolean = () => true) =>
      api.github.pull(number).then(
        (next) => alive() && setPull(next),
        (error: Error) => alive() && setFailed(error.message),
      ),
    [api, number],
  )

  useEffect(() => {
    let alive = true
    setPull(null)
    setFailed(null)
    void load(() => alive)
    return () => {
      alive = false
    }
  }, [load])

  const act = async (name: string, task: () => Promise<unknown>, done: string) => {
    setBusy(name)
    try {
      await task()
      toast(done)
      await load()
      onChanged()
      return true
    } catch (error) {
      toast.error((error as Error).message)
      return false
    } finally {
      setBusy(null)
    }
  }

  // The head lands in a local ref first, so the diff viewer reads it like any other comparison.
  const reviewFiles = () =>
    act(
      'files',
      async () => {
        const refs = await api.github.fetchPull(number)
        navigate({ kind: 'range', from: refs.base, to: refs.head, mode: 'merge-base' })
        show('changes')
      },
      `Fetched #${number}`,
    )

  if (failed)
    return (
      <p className="p-4 text-removed">
        Could not read #{number}: {failed}
      </p>
    )
  if (!pull) return <p className="p-4 text-muted-foreground">Loading #{number}...</p>

  const state = stateLabel(pull)
  const review = (event: ReviewEvent, body: string, clear: () => void, done: string) =>
    act(event, () => api.github.review(number, event, body).then(clear), done)
  const byFile = new Map<string, PullDetails['reviewComments']>()
  for (const comment of pull.reviewComments) byFile.set(comment.path, [...(byFile.get(comment.path) ?? []), comment])

  return (
    <article aria-label={`Pull request ${number}`} className="flex h-full flex-col">
      <header className="flex shrink-0 flex-col gap-2 border-border border-b bg-card px-4 py-3">
        <div className="flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-foreground">
            {pull.title} <span className="text-muted-foreground">#{pull.number}</span>
          </h2>
          <Button size="sm" variant="outline" loading={busy === 'files'} onClick={reviewFiles}>
            <FileDiff />
            Review files
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={pull.url} target="_blank" rel="noreferrer">
              <SquareArrowOutUpRight />
              GitHub
            </a>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <Badge variant="outline" size="sm" className={state.className}>
            <PullIcon pull={pull} />
            {state.text}
          </Badge>
          <Avatar user={pull.author} />
          <span className="text-foreground">{pull.author.login}</span>
          <span>{pull.merged ? 'merged into' : 'wants to merge into'}</span>
          <code className="text-tn-cyan">{pull.baseRef}</code>
          <span>from</span>
          <code className="text-tn-cyan">{pull.headRef}</code>
          <span className="text-added">+{pull.additions}</span>
          <span className="text-removed">-{pull.deletions}</span>
          <span>
            {pull.changedFiles} {pull.changedFiles === 1 ? 'file' : 'files'}
          </span>
          <Checks number={pull.number} />
          <Labels labels={pull.labels} />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4">
          <Comment author={pull.author} createdAt={pull.createdAt} body={pull.body} />
          {pull.comments.map((comment) => (
            <Comment key={comment.id} {...comment} />
          ))}
          {[...byFile].map(([path, comments]) => (
            <section key={path} aria-label={`Review comments on ${path}`} className="flex flex-col gap-2">
              <h3 className="text-tn-comment">{path}</h3>
              {comments.map((comment) => (
                <Comment key={comment.id} {...comment} extra={comment.line ? `line ${comment.line}` : 'outdated'} />
              ))}
            </section>
          ))}
          <Separator />
          <Composer
            label="Comment on this pull request"
            onSend={async (body) => {
              if (!(await act('comment', () => api.github.comment(number, body), 'Commented')))
                throw new Error('unsent')
            }}>
            {(body, clear) =>
              pull.state === 'open' ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!body.trim()}
                    loading={busy === 'REQUEST_CHANGES'}
                    onClick={() => review('REQUEST_CHANGES', body, clear, 'Requested changes')}>
                    <X />
                    Request changes
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={busy === 'APPROVE'}
                    onClick={() => review('APPROVE', body, clear, 'Approved')}>
                    <Check />
                    Approve
                  </Button>
                </>
              ) : null
            }
          </Composer>
          {pull.state === 'open' ? (
            <section
              aria-label="Merge"
              className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
              <GitMerge className="size-4 text-tn-magenta" />
              <span className="flex-1 text-muted-foreground">
                {pull.mergeable === false
                  ? 'This branch has conflicts to resolve first.'
                  : pull.draft
                    ? 'Draft pull requests cannot be merged.'
                    : 'Ready to merge.'}
              </span>
              <Select value={method} onValueChange={(value: string) => setMethod(value as MergeMethod)}>
                <SelectTrigger aria-label="Merge method" className="h-7 w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MERGE_METHODS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" disabled={pull.mergeable === false || pull.draft} loading={busy === 'merge'}>
                    <GitMerge />
                    Merge
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="flex w-80 flex-col gap-2">
                  <p>
                    {MERGE_METHODS.find((option) => option.value === method)?.label} #{number} into{' '}
                    <code className="text-tn-cyan">{pull.baseRef}</code> on GitHub?
                  </p>
                  <Button
                    size="sm"
                    className="self-end"
                    loading={busy === 'merge'}
                    onClick={() => act('merge', () => api.github.merge(number, method), `Merged #${number}`)}>
                    Confirm merge
                  </Button>
                </PopoverContent>
              </Popover>
            </section>
          ) : null}
          <p className="text-muted-foreground">
            Opened {ago(pull.createdAt)}, updated {ago(pull.updatedAt)}.
          </p>
        </div>
      </div>
    </article>
  )
}

export default function PullView({ onChanged }: { onChanged(): void }) {
  const { pullSelection } = useApp()
  const number = useStore(pullSelection, selectNumber)
  return (
    <GitHubGate>
      {number === null ? (
        <p className="p-4 text-muted-foreground">Pick a pull request on the left.</p>
      ) : (
        <Pull key={number} number={number} onChanged={onChanged} />
      )}
    </GitHubGate>
  )
}
