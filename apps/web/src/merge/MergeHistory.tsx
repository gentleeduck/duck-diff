import type { Commit, ConflictFile } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import { useQueries } from '@tanstack/react-query'
import { useApp } from '../app/AppProvider'
import { useView } from '../hooks/useView'
import { shortAge } from '../sidebar/relative-time'
import { SIDE, type Side } from './sides'

type Read = { data?: Commit[]; isPending: boolean; error: Error | null }

function CommitRow({ commit }: { commit: Commit }) {
  const { graphSelection, toolId } = useApp()
  const { show } = useView()
  const body = (
    <>
      <code className="shrink-0 text-tn-yellow">{commit.sha.slice(0, 7)}</code>
      <span className="min-w-0 flex-1 truncate" title={commit.subject}>
        {commit.subject}
      </span>
      <span className="max-w-32 shrink-0 truncate text-muted-foreground">{commit.authorName}</span>
      <span className="shrink-0 text-tn-comment tabular-nums">{shortAge(commit.authoredAt)}</span>
    </>
  )
  const row = 'flex h-7 w-full items-center gap-2 px-3 text-start'
  // git's tool window has no graph to open a commit in.
  if (toolId) return <li className={row}>{body}</li>
  return (
    <li>
      <Button
        variant="nothing"
        size="none"
        type="button"
        title="Open in the graph"
        onClick={() => {
          graphSelection.set(commit.sha)
          show('graph')
        }}
        className={`${row} cursor-pointer justify-start rounded-none hover:bg-accent/60`}>
        {body}
      </Button>
    </li>
  )
}

function SideCommits({ side, name, read, since }: { side: Side; name: string; read: Read; since: boolean }) {
  const look = SIDE[side]
  const commits = read.data ?? []
  return (
    <section aria-label={`${look.label} history`} className="min-w-0">
      <h3 className={`flex h-8 items-center gap-2 px-3 ${look.tint}`}>
        <span aria-hidden className={`h-4 w-1 shrink-0 rounded-full ${look.bar}`} />
        <span className={`shrink-0 ${look.text}`}>{look.label}</span>
        <span className="min-w-0 truncate text-foreground">{name}</span>
        <span className="ms-auto shrink-0 text-muted-foreground tabular-nums">
          {read.isPending ? '' : `${commits.length} ${commits.length === 1 ? 'commit' : 'commits'}`}
        </span>
      </h3>
      {read.error ? (
        <p className="px-3 py-1 text-removed">{read.error.message}</p>
      ) : read.isPending ? (
        <p className="px-3 py-1 text-muted-foreground">Reading the history…</p>
      ) : commits.length ? (
        <ul className="max-h-56 overflow-y-auto py-1">
          {commits.map((commit) => (
            <CommitRow key={commit.sha} commit={commit} />
          ))}
        </ul>
      ) : (
        <p className="px-3 py-1 text-muted-foreground">
          {since ? 'No commit on this side changed the file since the merge base.' : 'No commit changed the file.'}
        </p>
      )}
    </section>
  )
}

// The commits on each side that changed the file since the two parted, newest first: why each side reads as it
// does. Without a merge base, the side's latest commits to the file.
export function MergeHistory({ file, split }: { file: ConflictFile; split: boolean }) {
  const { queries } = useApp()
  const { ours, theirs, base } = file.sides
  const read = (head: string | undefined) => ({
    ...queries.git.commits({ head: head ?? 'HEAD', ...(base ? { base: base.sha } : {}), path: file.path, limit: 100 }),
    enabled: Boolean(head),
  })
  const [mine, yours] = useQueries({ queries: [read(ours?.sha), read(theirs?.sha)] })
  const since = Boolean(base)
  const current = <SideCommits side="ours" name={ours?.name ?? 'HEAD'} read={mine} since={since} />
  const incoming = theirs ? <SideCommits side="theirs" name={theirs.name} read={yours} since={since} /> : <div />
  const parted = (
    <p className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-muted-foreground">
      {base ? (
        <>
          <span className="shrink-0">Both sides start from</span>
          <code className="shrink-0 text-tn-yellow">{base.sha}</code>
          <span className="min-w-0 truncate" title={base.subject}>
            {base.subject}
          </span>
        </>
      ) : (
        'No merge base: each side shows its latest commits to the file.'
      )}
    </p>
  )
  return (
    <section aria-label={`History of ${file.path}`} className="border-border border-b bg-card/40">
      {split ? (
        <div className="grid grid-cols-3 [&>*:nth-child(2)]:border-border [&>*:nth-child(2)]:border-x">
          {current}
          {parted}
          {incoming}
        </div>
      ) : (
        <div className="flex flex-col">
          {current}
          {incoming}
          {parted}
        </div>
      )}
    </section>
  )
}
