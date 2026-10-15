import type { BlameLine } from '@duck-diff/protocol'
import { useApp } from '../app/AppProvider'
import { useView } from '../hooks/useView'
import { relativeTime } from '../sidebar/relative-time'

const UNCOMMITTED = /^0+$/

// The first line of each run from one commit names it; the rest of the run stays quiet. In a diff, where
// a hunk can start partway into a run, every line is named and repeats are dimmed. Clicking opens the
// commit in the graph.
export function BlameCell({
  blame,
  index,
  className = 'w-60',
  everyLine = false,
}: {
  blame: readonly BlameLine[] | null
  // The line's index in the file, from 0; -1 for a line the blamed version does not have.
  index: number
  className?: string
  everyLine?: boolean
}) {
  const { graphSelection } = useApp()
  const { show } = useView()
  const line = index >= 0 ? blame?.[index] : undefined
  const first = line && blame?.[index - 1]?.sha !== line.sha
  if (!line) return <span className={`${className} shrink-0 border-border border-e`} />
  const uncommitted = UNCOMMITTED.test(line.sha)
  return (
    <button
      type="button"
      title={`${line.summary}\n${line.author}, ${new Date(line.time * 1000).toLocaleString()}`}
      onClick={() => {
        if (uncommitted) return
        graphSelection.set(line.sha)
        show('graph')
      }}
      className={`${className} flex shrink-0 cursor-pointer gap-2 border-border border-e px-2 text-start text-muted-foreground hover:bg-accent/60 ${
        everyLine && !first ? 'opacity-40' : ''
      }`}>
      {first || everyLine ? (
        <>
          <span className="min-w-0 flex-1 truncate pe-0.5">{uncommitted ? 'Uncommitted' : line.author}</span>
          {uncommitted ? null : <span className="shrink-0 text-tn-comment">{relativeTime(line.time)}</span>}
        </>
      ) : null}
    </button>
  )
}
