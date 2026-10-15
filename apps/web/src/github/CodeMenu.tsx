import type { PullDetails } from '@duck-diff/protocol'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import { Check, ChevronDown, Code, Copy, GitBranch } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useGit } from '../git/GitProvider'
import { useRefs } from '../hooks/useRefs'

function CommandLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-background ps-2">
      <code className="min-w-0 flex-1 truncate text-foreground" title={text}>
        {text}
      </code>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Copy ${text}`}
        onClick={() =>
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          })
        }>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}

// GitHub's Code menu on a pull request: take its branch locally, here or from a terminal.
export function CodeMenu({ pull }: { pull: PullDetails }) {
  const { run } = useGit()
  const refs = useRefs()
  const [busy, setBusy] = useState(false)
  const checkout = async () => {
    setBusy(true)
    try {
      if (!(await run('fetch'))) return
      // A first checkout tracks the remote branch; after that the local branch is simply switched to.
      const local = refs.refs.some((ref) => ref.kind === 'branch' && ref.name === pull.headRef)
      if (local) await run('switch', { branch: pull.headRef, create: false }, `Switched to ${pull.headRef}`)
      else await run('track', { ref: `origin/${pull.headRef}` }, `Checked out ${pull.headRef}`)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Code />
          Code
          <ChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[26rem] flex-col gap-2">
        <p className="text-foreground">Check out this pull request</p>
        {pull.sameRepo && pull.headExists ? (
          <Button size="sm" variant="outline" className="self-start" loading={busy} onClick={() => void checkout()}>
            <GitBranch />
            Check out {pull.headRef} here
          </Button>
        ) : null}
        <p className="text-muted-foreground">Or from a terminal:</p>
        <CommandLine text={`gh pr checkout ${pull.number}`} />
        <CommandLine text={`git fetch origin pull/${pull.number}/head:${pull.headRef} && git switch ${pull.headRef}`} />
      </PopoverContent>
    </Popover>
  )
}
