import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react'
import { useGit } from './GitProvider'

export function SyncButtons() {
  const { status, busy, run } = useGit()
  const publish = status?.branch && !status.upstream
  return (
    <span className="flex items-center gap-1.5">
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
        loading={busy === 'pull'}
        disabled={busy !== null || !status?.upstream}
        onClick={() => void run('pull', undefined, 'Pulled')}>
        <ArrowDown />
        Pull{status?.behind ? <span className="text-tn-yellow">{status.behind}</span> : null}
      </Button>
      <Button
        size="sm"
        variant={status?.ahead || publish ? 'default' : 'outline'}
        aria-label={publish ? 'Publish branch' : 'Push'}
        loading={busy === 'push'}
        disabled={busy !== null || !status?.branch}
        onClick={() => void run('push', undefined, publish ? `Published ${status?.branch}` : 'Pushed')}>
        <ArrowUp />
        {publish ? 'Publish' : 'Push'}
        {status?.ahead ? <span>{status.ahead}</span> : null}
      </Button>
    </span>
  )
}
