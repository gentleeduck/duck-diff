import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react'
import { useApp } from '../app/AppProvider'
import { COUNT, ICON_ONLY, LABEL } from '../app/fit'
import { useGit } from './GitProvider'

export function SyncButtons() {
  const { status, busy, run } = useGit()
  const { queries } = useApp()
  const remotes = useQuery(queries.git.remotes()).data
  const publish = status?.branch && !status.upstream
  // A branch with nowhere to go: publishing would only fail.
  const nowhere = Boolean(publish && remotes?.length === 0)
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            aria-label="Fetch from remotes"
            loading={busy === 'fetch'}
            disabled={busy !== null}
            onClick={() => void run('fetch', undefined, 'Fetched from every remote')}>
            <RefreshCw />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Fetch from remotes</TooltipContent>
      </Tooltip>
      <Button
        size="sm"
        variant="outline"
        aria-label="Pull"
        title="Pull"
        className={ICON_ONLY.mid}
        loading={busy === 'pull'}
        disabled={busy !== null || !status?.upstream}
        onClick={() => void run('pull', undefined, 'Pulled')}>
        <ArrowDown />
        <span className={LABEL.mid}>Pull</span>
        {status?.behind ? (
          <Badge variant="soft-warning" size="sm" className={`rounded-full tabular-nums ${COUNT.mid}`}>
            {status.behind}
          </Badge>
        ) : null}
      </Button>
      <Button
        size="sm"
        variant={status?.ahead || (publish && !nowhere) ? 'default' : 'outline'}
        aria-label={publish ? 'Publish branch' : 'Push'}
        title={
          nowhere ? 'No remote to publish to; add one under Remotes in the graph' : publish ? 'Publish branch' : 'Push'
        }
        className={ICON_ONLY.mid}
        loading={busy === 'push'}
        disabled={busy !== null || !status?.branch || nowhere}
        onClick={() => void run('push', undefined, publish ? `Published ${status?.branch}` : 'Pushed')}>
        <ArrowUp />
        <span className={LABEL.mid}>{publish ? 'Publish' : 'Push'}</span>
        {status?.ahead ? (
          <Badge variant="secondary" size="sm" className={`rounded-full tabular-nums ${COUNT.mid}`}>
            {status.ahead}
          </Badge>
        ) : null}
      </Button>
    </span>
  )
}
