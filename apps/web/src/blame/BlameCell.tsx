import type { BlameLine } from '@duck-diff/protocol'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { useApp } from '../app/AppProvider'
import { useView } from '../hooks/useView'
import { shortAge } from '../sidebar/relative-time'

const UNCOMMITTED = /^0+$/

// The first line of each run from one commit names it; the rest of the run stays quiet. In a diff, where
// a hunk can start partway into a run, every line is named and repeats are dimmed. The tooltip has the
// whole name, the date and the message; a click opens the commit in the graph.
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
  const named = first || everyLine
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="nothing"
          size="none"
          type="button"
          data-own-tooltip
          onClick={() => {
            if (uncommitted) return
            graphSelection.set(line.sha)
            show('graph')
          }}
          className={`${className} flex shrink-0 cursor-pointer gap-2 border-border border-e px-2 text-start text-muted-foreground hover:bg-accent/60 ${
            everyLine && !first ? 'opacity-40' : ''
          } justify-start rounded-none`}>
          {named ? (
            <>
              <span className="min-w-0 flex-1 truncate pe-0.5">{uncommitted ? 'Uncommitted' : line.author}</span>
              {uncommitted ? null : (
                <span className="shrink-0 text-tn-comment tabular-nums">{shortAge(line.time)}</span>
              )}
            </>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-md">
        {uncommitted ? (
          'Not committed yet'
        ) : (
          <span className="flex flex-col gap-0.5">
            <span>
              {line.author} <span className="text-muted-foreground">{new Date(line.time * 1000).toLocaleString()}</span>
            </span>
            <span className="text-muted-foreground">
              <span className="text-tn-yellow">{line.sha.slice(0, 7)}</span> {line.summary}
            </span>
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
