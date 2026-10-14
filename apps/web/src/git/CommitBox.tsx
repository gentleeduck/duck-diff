import { Button, Checkbox, Label, Textarea } from '@duck-diff/ui'
import { GitCommitHorizontal } from 'lucide-react'
import { useId, useState } from 'react'
import { VISIBLE_BOX } from '../viewer/FileActions'
import { useGit } from './GitProvider'

export function CommitBox() {
  const { status, busy, run } = useGit()
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const amendId = useId()
  const staged = status?.staged ?? 0
  const ready = message.trim().length > 0 && (staged > 0 || amend) && busy === null

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
      </div>
    </form>
  )
}
