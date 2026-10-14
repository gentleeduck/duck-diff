import { Button, Checkbox, Label, Textarea, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { Archive, GitCommitHorizontal } from 'lucide-react'
import { useId, useState } from 'react'
import { VISIBLE_BOX } from '../viewer/FileActions'
import { useGit } from './GitProvider'
import { OperationBanner } from './OperationBanner'

export function CommitBox() {
  const { status, busy, run } = useGit()
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const amendId = useId()
  const staged = status?.staged ?? 0
  // An unfinished merge or pick commits its resolution even when nothing new is staged.
  const finishing = Boolean(status?.operation && status.operation !== 'rebase')
  const ready = message.trim().length > 0 && (staged > 0 || amend || finishing) && busy === null

  const commit = async (andPush: boolean) => {
    const ok = await run('commit', { message, amend }, amend ? 'Amended the last commit' : 'Committed')
    if (!ok) return
    setMessage('')
    setAmend(false)
    if (andPush) await run('push', undefined, 'Pushed')
  }

  return (
    <form
      aria-label="Commit"
      className="flex flex-col gap-2 border-border border-t p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) void commit(false)
      }}>
      <OperationBanner />
      <Textarea
        aria-label="Commit message"
        placeholder={
          staged ? `Message for ${staged} staged ${staged === 1 ? 'file' : 'files'}` : 'Stage changes to commit'
        }
        value={message}
        rows={3}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && ready) void commit(false)
        }}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id={amendId}
          checked={amend}
          onCheckedChange={(next) => setAmend(next === true)}
          className={VISIBLE_BOX}
        />
        <Label htmlFor={amendId}>Amend last commit</Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="flex-1" disabled={!ready} loading={busy === 'commit'}>
          <GitCommitHorizontal />
          {amend ? 'Amend' : 'Commit'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!ready || !status?.branch}
          onClick={() => void commit(true)}>
          Commit and push
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Stash changes"
              disabled={busy !== null}
              loading={busy === 'stash'}
              onClick={async () => {
                if (await run('stash', { message: message.trim(), untracked: true }, 'Stashed your changes')) {
                  setMessage('')
                }
              }}>
              <Archive />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stash every change, new files too (the message names it)</TooltipContent>
        </Tooltip>
      </div>
    </form>
  )
}
