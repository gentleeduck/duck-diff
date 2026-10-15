import type { ChangedFile, PlanCommit } from '@duck-diff/protocol'
import { useQuery } from '@tanstack/react-query'
import { useApp } from '../app/AppProvider'
import { relativeTime } from '../sidebar/relative-time'

const SHOWN = 8
const short = (sha: string | null) => (sha ? sha.slice(0, 7) : '')
const NO_LOG: PlanCommit[] = []

// A submodule change is one pointer moving, so it reads as old to new commit with the commits between.
export function SubmoduleSummary({ file }: { file: ChangedFile }) {
  const { queries } = useApp()
  const read = useQuery({
    ...queries.git.submoduleLog(file.path, file.oldSha, file.newSha ?? ''),
    enabled: Boolean(file.newSha),
  })
  const log = read.isError ? NO_LOG : (read.data ?? null)

  let headline: string
  if (!file.oldSha) headline = `Submodule added at ${short(file.newSha)}`
  else if (!file.newSha) headline = `Submodule removed, it was at ${short(file.oldSha)}`
  else headline = `Submodule moved from ${short(file.oldSha)} to ${short(file.newSha)}`
  return (
    <section aria-label={`Submodule ${file.path}`} className="border-border border-b bg-card/60 px-4 py-2">
      <p className="text-tn-magenta">
        {headline}
        {log?.length ? (
          <span className="text-muted-foreground">
            {' '}
            ({log.length === 200 ? '200 or more' : log.length} {log.length === 1 ? 'commit' : 'commits'})
          </span>
        ) : null}
      </p>
      {log?.length ? (
        <ul className="mt-1 flex flex-col">
          {log.slice(0, SHOWN).map((commit) => (
            <li key={commit.sha} className="flex items-baseline gap-2">
              <code className="shrink-0 text-tn-yellow">{short(commit.sha)}</code>
              <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
              <span className="shrink-0 text-muted-foreground">
                {commit.author}, {relativeTime(commit.time)}
              </span>
            </li>
          ))}
          {log.length > SHOWN ? <li className="text-muted-foreground">and {log.length - SHOWN} more</li> : null}
        </ul>
      ) : null}
      {log && !log.length && file.oldSha && file.newSha ? (
        <p className="text-muted-foreground">
          The commits between are not here; check the submodule out to list them, or the pointer moved back.
        </p>
      ) : null}
    </section>
  )
}
