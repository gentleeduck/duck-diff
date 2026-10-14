import type { ChangedFile } from '@duck-diff/protocol'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@duck-diff/ui'
import type { Hunk } from '@pierre/diffs'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ApiError } from '../lib/api'
import { type WriteKind, writeRequest } from '../viewer/actions'

interface Writes {
  perform(kind: WriteKind, file: ChangedFile, hunk?: { index: number; hunk: Hunk }): Promise<void>
  undo(): Promise<void>
}

const WritesContext = createContext<Writes | null>(null)

const DONE: Record<WriteKind, string> = { stage: 'Staged', unstage: 'Unstaged', discard: 'Discarded' }

export function WritesProvider({ children }: { children: ReactNode }) {
  const { api, session } = useApp()
  const [question, setQuestion] = useState<string | null>(null)
  const answer = useRef<(yes: boolean) => void>(() => {})

  const confirm = useCallback(
    (text: string) =>
      new Promise<boolean>((resolve) => {
        answer.current = resolve
        setQuestion(text)
      }),
    [],
  )
  const close = (yes: boolean) => {
    setQuestion(null)
    answer.current(yes)
  }

  const undo = useCallback(async () => {
    const { restored } = await api.undo()
    toast(restored ? `Restored ${restored.join(', ')}` : 'Nothing left to undo')
    void session.reload()
  }, [api, session])

  const perform = useCallback<Writes['perform']>(
    async (kind, file, hunk) => {
      const what = hunk ? `this change in ${file.path}` : file.path
      if (kind === 'discard' && !(await confirm(`Discard ${what}? You can undo it right after.`))) return
      try {
        await api.write(writeRequest(kind, file, hunk))
        const label = `${DONE[kind]} ${hunk ? `a change in ${file.path}` : file.path}`
        if (kind === 'discard')
          toast(label, { duration: 10_000, action: { label: 'Undo', onClick: () => void undo() } })
        else toast(label)
      } catch (error) {
        // A stale page means the file moved underneath it; the reload below shows the current state.
        toast.error(
          error instanceof ApiError && error.code === 'stale'
            ? `${file.path} changed on disk, so nothing was written. Showing the latest version.`
            : `Could not ${kind} ${file.path}: ${(error as Error).message}`,
        )
      }
      void session.reload()
    },
    [api, session, confirm, undo],
  )

  const value = useMemo(() => ({ perform, undo }), [perform, undo])
  return (
    <WritesContext.Provider value={value}>
      {children}
      <Dialog open={question !== null} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Discard changes</DialogTitle>
          <DialogDescription>{question}</DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => close(false)}>
              Keep
            </Button>
            <Button variant="destructive" onClick={() => close(true)}>
              Discard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </WritesContext.Provider>
  )
}

export function useWrites(): Writes {
  const value = useContext(WritesContext)
  if (!value) throw new Error('useWrites needs a WritesProvider')
  return value
}
