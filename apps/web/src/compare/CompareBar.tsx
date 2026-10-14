import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { X } from 'lucide-react'
import { useRefs } from '../hooks/useRefs'
import { useSession } from '../hooks/useSession'
import { useTarget } from '../hooks/useTarget'
import type { SessionState } from '../state/session'
import { describeTarget, toggleOperator, withoutPath, withSide } from './model'
import { RefPicker } from './RefPicker'

const OPERATOR_HELP = {
  '..': 'Comparing the two tips directly. Switch to only the changes made on the right side.',
  '...': 'Showing only what changed on the right side since it split off. Switch to comparing the tips directly.',
}

const selectStats = (state: SessionState) => {
  let additions = 0
  let deletions = 0
  for (const file of state.files) {
    additions += file.additions ?? 0
    deletions += file.deletions ?? 0
  }
  return `${state.files.length}:${additions}:${deletions}`
}

export function CompareBar() {
  const { target, navigate } = useTarget()
  const refs = useRefs()
  const [files = '0', additions = '0', deletions = '0'] = useSession(selectStats).split(':')
  const { from, to, operator, path } = describeTarget(target)

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <h1 className="flex min-w-0 items-center gap-2">
        <RefPicker label={from} side="from" refs={refs} onPick={(end) => navigate(withSide(target, 'from', end))} />
        {operator ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                aria-label={`Range operator ${operator}`}
                onClick={() => navigate(toggleOperator(target))}>
                {operator}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{OPERATOR_HELP[operator]}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="px-1 text-muted-foreground">to</span>
        )}
        <RefPicker label={to} side="to" refs={refs} onPick={(end) => navigate(withSide(target, 'to', end))} />
      </h1>
      {path ? (
        <span className="flex min-w-0 items-center gap-1 font-mono text-muted-foreground">
          <span className="truncate" title={path}>
            {path}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Show every file"
            onClick={() => navigate(withoutPath(target))}>
            <X />
          </Button>
        </span>
      ) : null}
      <p className="shrink-0 text-muted-foreground tabular-nums">
        {files} {files === '1' ? 'file' : 'files'}
        <span className="ml-3 text-added">+{additions}</span>
        <span className="ml-1.5 text-removed">-{deletions}</span>
      </p>
    </div>
  )
}
