import type { Commit, DiffTarget, Ref } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import type { MouseEvent } from 'react'
import { useApp } from '../app/AppProvider'
import { historyTarget } from '../compare/model'
import { useTarget } from '../hooks/useTarget'
import { useStore } from '../lib/store'
import { relativeTime } from './relative-time'

const DEFAULT_BRANCHES = ['main', 'master', 'trunk']
const LIMIT = 200
const EMPTY: { commits: Commit[]; stashes: Ref[] } = { commits: [], stashes: [] }
const selectPath = (path: string | null) => path

function selectedShas(target: DiffTarget): Set<string> {
  if (target.kind === 'commit') return new Set([target.sha])
  if (target.kind === 'range' && target.path) return new Set([target.from, target.to])
  return new Set()
}

function Row({
  subject,
  sha,
  who,
  when,
  current,
  onClick,
}: {
  subject: string
  sha: string
  who: string
  when: string
  current: boolean
  onClick(event: MouseEvent): void
}) {
  return (
    <li>
      <Button
        size="sm"
        variant="ghost"
        aria-current={current}
        onClick={onClick}
        className="mx-2 h-auto w-[calc(100%-1rem)] flex-col items-stretch gap-0.5 px-2 py-1.5 text-start aria-[current=true]:bg-accent">
        <span className="truncate">{subject}</span>
        <span className="flex gap-2 text-muted-foreground">
          <span className="font-mono">{sha.slice(0, 7)}</span>
          <span className="truncate">{who}</span>
          <span className="ml-auto shrink-0">{when}</span>
        </span>
      </Button>
    </li>
  )
}

function useCommits(path: string | null) {
  const { queries } = useApp()
  const refs = useQuery(queries.git.refs())
  let query: { head: string; base?: string; path?: string; limit: number } | null = null
  if (refs.data) {
    const branches = refs.data.filter((ref) => ref.kind === 'branch')
    const current = branches.find((ref) => ref.current)?.name
    // On a feature branch, history means the commits that branch adds; on the default branch, everything.
    const base = DEFAULT_BRANCHES.find((name) => name !== current && branches.some((ref) => ref.name === name))
    query = path
      ? { head: 'HEAD', path, limit: LIMIT }
      : base
        ? { head: 'HEAD', base, limit: LIMIT }
        : { head: 'HEAD', limit: LIMIT }
  }
  const commits = useQuery({ ...queries.git.commits(query ?? { head: 'HEAD' }), enabled: query !== null })
  if (refs.isError || commits.isError) return EMPTY
  if (!refs.data || !commits.data) return null
  return { commits: commits.data, stashes: refs.data.filter((ref) => ref.kind === 'stash') }
}

export function HistoryList({ now }: { now?: number }) {
  const { fileHistory } = useApp()
  const path = useStore(fileHistory, selectPath)
  const { target, navigate } = useTarget()
  const state = useCommits(path)
  if (state === null) return null

  const selected = selectedShas(target)
  const order = state.commits.map((commit) => commit.sha)
  const open = (sha: string) => (event: MouseEvent) => {
    if (!path) return navigate({ kind: 'commit', sha })
    // Shift-click keeps the version already open and compares it with the one clicked.
    const anchor = target.kind === 'commit' ? target.sha : target.kind === 'range' ? target.to : undefined
    navigate(historyTarget(path, order, sha, event.shiftKey ? anchor : undefined))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {path ? (
        <div className="flex items-center gap-1 border-border border-b px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono" title={path}>
            {path}
          </span>
          <Button variant="ghost" size="icon" aria-label="Back to branch history" onClick={() => fileHistory.set(null)}>
            <X />
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {state.commits.length === 0 ? (
          <p className="p-3 text-muted-foreground">No commits to show.</p>
        ) : (
          <ol>
            {state.commits.map((commit) => (
              <Row
                key={commit.sha}
                subject={commit.subject}
                sha={commit.sha}
                who={commit.authorName}
                when={relativeTime(commit.authoredAt, now)}
                current={selected.has(commit.sha)}
                onClick={open(commit.sha)}
              />
            ))}
          </ol>
        )}
        {path && state.commits.length > 1 ? (
          <p className="px-3 py-2 text-muted-foreground">Shift-click a second commit to compare versions.</p>
        ) : null}
        {!path && state.stashes.length > 0 ? (
          <section aria-label="Stashes" className="mt-2 border-border border-t pt-1">
            <h3 className="px-3 py-1 text-muted-foreground">Stashes</h3>
            <ol>
              {state.stashes.map((stash) => (
                <Row
                  key={stash.sha}
                  subject={stash.subject ?? stash.name}
                  sha={stash.sha}
                  who={stash.name}
                  when={relativeTime(stash.committedAt, now)}
                  current={selected.has(stash.sha)}
                  onClick={open(stash.sha)}
                />
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </div>
  )
}
