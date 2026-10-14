import type { Commit } from '@duck-diff/protocol'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useTarget } from '../hooks/useTarget'
import { relativeTime } from './relative-time'

const DEFAULT_BRANCHES = ['main', 'master', 'trunk']
const LIMIT = 200

export function HistoryList({ now }: { now?: number }) {
  const { api } = useApp()
  const { target, navigate } = useTarget()
  const [commits, setCommits] = useState<Commit[] | null>(null)

  useEffect(() => {
    let alive = true
    api
      .refs()
      .then((refs) => {
        const branches = refs.filter((ref) => ref.kind === 'branch')
        const current = branches.find((ref) => ref.current)?.name
        // On a feature branch, history means the commits that branch adds; on the default branch, everything.
        const base = DEFAULT_BRANCHES.find((name) => name !== current && branches.some((ref) => ref.name === name))
        return api.commits(base ? { head: 'HEAD', base, limit: LIMIT } : { head: 'HEAD', limit: LIMIT })
      })
      .then((list) => alive && setCommits(list))
      .catch(() => alive && setCommits([]))
    return () => {
      alive = false
    }
  }, [api])

  if (commits === null) return null
  if (commits.length === 0) return <p className="p-3 text-[13px] text-[var(--dd-muted)]">No commits to show.</p>

  const selected = target.kind === 'commit' ? target.sha : null
  return (
    <ol className="min-h-0 flex-1 overflow-y-auto py-1">
      {commits.map((commit) => (
        <li key={commit.sha}>
          <button
            type="button"
            aria-current={commit.sha === selected}
            onClick={() => navigate({ kind: 'commit', sha: commit.sha })}
            className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-[var(--dd-base)] aria-[current=true]:bg-[color-mix(in_oklab,var(--dd-accent)_18%,transparent)]">
            <span className="truncate text-[13px]">{commit.subject}</span>
            <span className="flex gap-2 text-[12px] text-[var(--dd-muted)]">
              <span className="font-[var(--dd-font-code)]">{commit.sha.slice(0, 7)}</span>
              <span>{commit.authorName}</span>
              <span className="ml-auto">{relativeTime(commit.authoredAt, now)}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
