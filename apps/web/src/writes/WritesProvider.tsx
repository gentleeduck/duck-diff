import type { ChangedFile } from '@duck-diff/protocol'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@duck-diff/ui'
import type { Hunk } from '@pierre/diffs'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ApiError } from '../lib/api'
import { useRefresh } from '../query/useRefresh'
import { type WriteKind, writeRequest } from '../viewer/actions'
import type { PickedLine } from '../viewer/picked-lines'

interface Writes {
  perform(kind: WriteKind, file: ChangedFile, hunk?: { index: number; hunk: Hunk }): Promise<void>
  // Many files with one question and one toast, for a folder or a whole section.
  performAll(kind: WriteKind, files: ChangedFile[], what: string): Promise<void>
  undo(): Promise<void>
  // Chosen lines of one file, from a drag over the diff.
  performLines(kind: WriteKind, file: ChangedFile, lines: PickedLine[]): Promise<void>
}

const WritesContext = createContext<Writes | null>(null)

const DONE: Record<WriteKind, string> = { stage: 'Staged', unstage: 'Unstaged', discard: 'Discarded' }

export function WritesProvider({ children }: { children: ReactNode }) {
  const { api, session } = useApp()
  const topics = useRefresh()
  // The diff and everything reading the index (stage panel, status) show the write at once.
  const reload = useCallback(() => {
    void session.reload()
    void topics('index', 'worktree')
  }, [session, topics])
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
    reload()
  }, [api, reload])

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
      reload()
    },
    [api, confirm, undo, reload],
  )

  const performAll = useCallback<Writes['performAll']>(
    async (kind, files, what) => {
      if (files.length === 0) return
      if (kind === 'discard' && !(await confirm(`Discard ${what}? You can undo it right after.`))) return
      let failed = 0
      // One at a time: every write takes the index lock.
      for (const file of files) {
        try {
          await api.write(writeRequest(kind, file))
        } catch {
          failed++
        }
      }
      const label = `${DONE[kind]} ${what}`
      if (failed) toast.error(`${label}, but ${failed} of ${files.length} could not be written`)
      else if (kind === 'discard') {
        // Each discarded file left its own snapshot, newest first, so undo takes them all back.
        const restoreAll = async () => {
          const restored: string[] = []
          for (let i = 0; i < files.length - failed; i++) restored.push(...((await api.undo()).restored ?? []))
          toast(
            restored.length
              ? `Restored ${restored.length} ${restored.length === 1 ? 'file' : 'files'}`
              : 'Nothing left to undo',
          )
          reload()
        }
        toast(label, { duration: 10_000, action: { label: 'Undo', onClick: () => void restoreAll() } })
      } else toast(label)
      reload()
    },
    [api, confirm, reload],
  )

  const performLines = useCallback<Writes['performLines']>(
    async (kind, file, lines) => {
      const count = `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`
      if (kind === 'discard' && !(await confirm(`Discard ${count} in ${file.path}? You can undo it right after.`)))
        return
      try {
        await api.write({
          action: `${kind}-lines`,
          file: { path: file.path, oldPath: file.oldPath, status: file.status, newSha: file.newSha },
          lines,
        })
        const label = `${DONE[kind]} ${count} in ${file.path}`
        if (kind === 'discard')
          toast(label, { duration: 10_000, action: { label: 'Undo', onClick: () => void undo() } })
        else toast(label)
      } catch (error) {
        toast.error(
          error instanceof ApiError && error.code === 'stale'
            ? `${file.path} changed on disk, so nothing was written. Showing the latest version.`
            : `Could not ${kind} lines in ${file.path}: ${(error as Error).message}`,
        )
      }
      reload()
    },
    [api, confirm, undo, reload],
  )

  const value = useMemo(() => ({ perform, performAll, undo, performLines }), [perform, performAll, undo, performLines])
  return (
    <WritesContext.Provider value={value}>
      {children}
      <Dialog open={question !== null} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Discard changes</DialogTitle>
          <DialogDescription>{question}</DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => close(false)}>
              Keep
            </Button>
            <Button size="sm" variant="destructive" onClick={() => close(true)}>
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
