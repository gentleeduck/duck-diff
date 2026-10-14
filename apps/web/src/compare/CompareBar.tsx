import { Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { useRefs } from '../hooks/useRefs'
import { useSession } from '../hooks/useSession'
import { useTarget } from '../hooks/useTarget'
import type { SessionState } from '../state/session'
import { describeTarget, toggleOperator, withSide } from './model'
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
  const { from, to, operator } = describeTarget(target)

  return (
    <div className="flex min-w-0 flex-1 items-center gap-6">
      <h1 className="flex items-baseline gap-1 truncate font-[var(--dd-font-code)] text-[15px]">
        <RefPicker label={from} side="from" refs={refs} onPick={(end) => navigate(withSide(target, 'from', end))} />
        {operator ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Range operator ${operator}`}
                onClick={() => navigate(toggleOperator(target))}
                className="rounded-sm px-0.5 font-semibold text-[var(--dd-accent)]">
                {operator}
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{OPERATOR_HELP[operator]}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="px-1 text-[var(--dd-muted)]">to</span>
        )}
        <RefPicker label={to} side="to" refs={refs} onPick={(end) => navigate(withSide(target, 'to', end))} />
      </h1>
      <p className="shrink-0 text-[13px] text-[var(--dd-muted)] tabular-nums">
        {files} {files === '1' ? 'file' : 'files'}
        <span className="ml-3 text-[#3fb950]">+{additions}</span>
        <span className="ml-1.5 text-[#f85149]">-{deletions}</span>
      </p>
    </div>
  )
}
