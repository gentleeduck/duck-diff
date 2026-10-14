import type { Commit, DiffTarget, Ref } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import { X } from 'lucide-react'
import { type MouseEvent, useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { historyTarget } from '../compare/model'
import { useTarget } from '../hooks/useTarget'
import { useStore } from '../lib/store'
import { relativeTime } from './relative-time'

const DEFAULT_BRANCHES = ['main', 'master', 'trunk']
const LIMIT = 200
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
      <button
        type="button"
        aria-current={current}
        onClick={onClick}
        className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-[var(--dd-base)] aria-[current=true]:bg-[color-mix(in_oklab,var(--dd-accent)_18%,transparent)]">
        <span className="truncate text-[13px]">{subject}</span>
        <span className="flex gap-2 text-[12px] text-[var(--dd-muted)]">
          <span className="font-[var(--dd-font-code)]">{sha.slice(0, 7)}</span>
          <span className="truncate">{who}</span>
          <span className="ml-auto shrink-0">{when}</span>
        </span>
      </button>
    </li>
  )
}

function useCommits(path: string | null) {
  const { api } = useApp()
  const [state, setState] = useState<{ commits: Commit[]; stashes: Ref[] } | null>(null)
  useEffect(() => {
    let alive = true
    setState(null)
    api
      .refs()
      .then(async (refs) => {
        const stashes = refs.filter((ref) => ref.kind === 'stash')
        if (path) return { commits: await api.commits({ head: 'HEAD', path, limit: LIMIT }), stashes }
        const branches = refs.filter((ref) => ref.kind === 'branch')
        const current = branches.find((ref) => ref.current)?.name
        // On a feature branch, history means the commits that branch adds; on the default branch, everything.
        const base = DEFAULT_BRANCHES.find((name) => name !== current && branches.some((ref) => ref.name === name))
        const query = base ? { head: 'HEAD', base, limit: LIMIT } : { head: 'HEAD', limit: LIMIT }
        return { commits: await api.commits(query), stashes }
      })
      .then((next) => alive && setState(next))
      .catch(() => alive && setState({ commits: [], stashes: [] }))
    return () => {
      alive = false
    }
  }, [api, path])
  return state
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
        <div className="flex items-center gap-1 border-[var(--dd-line)] border-b px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate font-[var(--dd-font-code)] text-[12px]" title={path}>
            {path}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Back to branch history"
            onClick={() => fileHistory.set(null)}>
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {state.commits.length === 0 ? (
          <p className="p-3 text-[13px] text-[var(--dd-muted)]">No commits to show.</p>
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
          <p className="px-3 py-2 text-[12px] text-[var(--dd-muted)]">
            Shift-click a second commit to compare versions.
          </p>
        ) : null}
        {!path && state.stashes.length > 0 ? (
          <section aria-label="Stashes" className="mt-2 border-[var(--dd-line)] border-t pt-1">
            <h3 className="px-3 py-1 text-[12px] text-[var(--dd-muted)]">Stashes</h3>
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
