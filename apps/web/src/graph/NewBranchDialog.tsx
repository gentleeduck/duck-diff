import { Button, Dialog, DialogContent, DialogFooter, DialogTitle, Input } from '@duck-diff/ui'
import { useState } from 'react'
import { useGit } from '../git/GitProvider'
import { usableBranchName, useCommitActions } from './commit-actions'

export function NewBranchDialog({ sha, onClose }: { sha: string | null; onClose(): void }) {
  const { busy } = useGit()
  const { createBranch } = useCommitActions()
  const [name, setName] = useState('')
  const submit = async () => {
    if (!sha || !usableBranchName(name)) return
    if (await createBranch(name.trim(), sha)) {
      setName('')
      onClose()
    }
  }
  return (
    <Dialog open={sha !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>New branch from {sha?.slice(0, 7)}</DialogTitle>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}>
          <Input
            autoFocus
            aria-label="Branch name"
            placeholder="feat/name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <DialogFooter>
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!usableBranchName(name)} loading={busy === 'switch'}>
              Create and switch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
