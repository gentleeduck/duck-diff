import { Button, Checkbox, Label, Popover, PopoverContent, PopoverTrigger, Textarea } from '@duck-diff/ui'
import { Archive, ArchiveX, Brush, Ellipsis, GitCommitHorizontal, Undo2, Upload } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { BisectBanner } from '../graph/BisectBanner'
import { useKept } from '../lib/kept'
import { VISIBLE_BOX } from '../viewer/FileActions'
import { useGit } from './GitProvider'
import { OperationBanner } from './OperationBanner'

function MoreItem({ onSelect, children }: { onSelect(): void; children: ReactNode }) {
  return (
    <Button type="button" size="sm" variant="ghost" className="w-full justify-start" onClick={onSelect}>
      {children}
    </Button>
  )
}

export function CommitBox() {
  const { api } = useApp()
  const { status, busy, run } = useGit()
  const [message, setMessage] = useKept('commit-message', '')
  const [amend, setAmend] = useKept('commit-amend', false)
  const [signoff, setSignoff] = useKept('commit-signoff', false)
  const [more, setMore] = useKept('commit-more', false)
  const amendId = useId()
  const signoffId = useId()
  const staged = status?.staged ?? 0
  // An unfinished merge or pick commits its resolution even when nothing new is staged.
  const finishing = Boolean(status?.operation && status.operation !== 'rebase')
  const ready = message.trim().length > 0 && (staged > 0 || amend || finishing) && busy === null

  const commit = async (andPush: boolean) => {
    const ok = await run('commit', { message, amend, signoff }, amend ? 'Amended the last commit' : 'Committed')
    if (!ok) return
    setMessage('')
    setAmend(false)
    if (andPush) await run('push', undefined, 'Pushed')
  }

  // Amending starts from the message being replaced, as `git commit --amend` does.
  const toggleAmend = async (next: boolean) => {
    setAmend(next)
    if (next && !message.trim()) setMessage(await api.lastMessage().catch(() => ''))
  }

  const pick = (action: () => Promise<unknown>) => {
    setMore(false)
    void action()
  }

  return (
    <form
      aria-label="Commit"
      className="@container flex flex-col gap-2 border-border border-t p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) void commit(false)
      }}>
      <OperationBanner />
      <BisectBanner />
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id={amendId}
            checked={amend}
            onCheckedChange={(next) => void toggleAmend(next === true)}
            className={VISIBLE_BOX}
          />
          <Label htmlFor={amendId}>Amend</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={signoffId}
            checked={signoff}
            onCheckedChange={(next) => setSignoff(next === true)}
            className={VISIBLE_BOX}
          />
          <Label htmlFor={signoffId}>Sign off</Label>
        </div>
      </div>
      {/* Two equal halves; when a half is too narrow for the long label, it says the short one. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
        <Button type="submit" size="sm" className="min-w-0" disabled={!ready} loading={busy === 'commit'}>
          <GitCommitHorizontal />
          <span className="truncate">{amend ? 'Amend' : 'Commit'}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-w-0"
          aria-label="Commit and push"
          disabled={!ready || !status?.branch}
          onClick={() => void commit(true)}>
          <Upload />
          <span className="truncate @max-[25rem]:hidden">Commit and push</span>
          <span className="hidden truncate @max-[25rem]:inline">Push</span>
        </Button>
        <Popover open={more} onOpenChange={setMore}>
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant="outline" aria-label="More commit actions">
              <Ellipsis />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="flex w-64 flex-col p-1">
            <MoreItem
              onSelect={() =>
                pick(async () => {
                  if (await run('stash', { message: message.trim(), untracked: true }, 'Stashed your changes')) {
                    setMessage('')
                  }
                })
              }>
              <Archive />
              Stash every change
            </MoreItem>
            <MoreItem
              onSelect={() =>
                pick(() => run('stash-staged', { message: message.trim() }, 'Stashed the staged changes'))
              }>
              <ArchiveX />
              Stash staged only
            </MoreItem>
            <MoreItem
              onSelect={() =>
                pick(async () => {
                  if (await run('undo-commit', undefined, 'Undid the last commit; its changes are staged')) {
                    setMessage(await api.lastMessage().catch(() => ''))
                  }
                })
              }>
              <Undo2 />
              Undo last commit
            </MoreItem>
            <MoreItem
              onSelect={() =>
                pick(async () => {
                  const yes = await ask.confirm({
                    title: 'Force push',
                    body: 'Replaces the remote branch with yours. It refuses if someone pushed since your last fetch.',
                    action: 'Force push',
                    destructive: true,
                  })
                  if (yes) await run('force-push', undefined, 'Force pushed')
                })
              }>
              <Upload />
              Force push (with lease)
            </MoreItem>
            <MoreItem
              onSelect={() =>
                pick(async () => {
                  const yes = await ask.confirm({
                    title: 'Delete untracked files',
                    body: 'Removes every untracked file and folder. Ignored files stay. This cannot be undone.',
                    action: 'Delete them',
                    destructive: true,
                  })
                  if (yes) await run('clean', undefined, 'Deleted untracked files')
                })
              }>
              <Brush />
              Clean untracked files
            </MoreItem>
          </PopoverContent>
        </Popover>
      </div>
    </form>
  )
}
