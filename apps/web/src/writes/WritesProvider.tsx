import type { ChangedFile } from '@duck-diff/protocol'
import type { Hunk } from '@pierre/diffs'
import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
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

const confirmDiscard = (what: string, path?: string) =>
  ask.confirm({
    title: 'Discard changes',
    body: `Discard ${what}? You can undo it right after.`,
    detail: path,
    action: 'Discard',
    destructive: true,
  })

function failedWrite(kind: string, what: string, path: string, error: unknown) {
  // A stale page means the file moved underneath it; the reload after this shows the current state.
  if (error instanceof ApiError && error.code === 'stale')
    toast.warning(`${path} changed on disk`, { description: 'Nothing was written. Showing the latest version.' })
  else toast.error(`Could not ${kind} ${what}`, { description: `${path}: ${(error as Error).message}` })
}

export function WritesProvider({ children }: { children: ReactNode }) {
  const { api, session } = useApp()
  const topics = useRefresh()
  // The diff and everything reading the index (stage panel, status) show the write at once.
  const reload = useCallback(() => {
    void session.reload()
    void topics('index', 'worktree')
  }, [session, topics])

  const undo = useCallback(async () => {
    const { restored } = await api.undo()
    if (restored) toast.success('Restored', { description: restored.join(', ') })
    else toast('Nothing left to undo')
    reload()
  }, [api, reload])

  const perform = useCallback<Writes['perform']>(
    async (kind, file, hunk) => {
      if (kind === 'discard' && !(await confirmDiscard(hunk ? 'this change' : 'this file', file.path))) return
      try {
        await api.write(writeRequest(kind, file, hunk))
        const label = `${DONE[kind]} ${hunk ? 'a change' : 'the file'}`
        if (kind === 'discard')
          toast.success(label, {
            description: file.path,
            duration: 10_000,
            action: { label: 'Undo', onClick: () => void undo() },
          })
        else toast.success(label, { description: file.path })
      } catch (error) {
        failedWrite(kind, hunk ? 'the change' : 'the file', file.path, error)
      }
      reload()
    },
    [api, undo, reload],
  )

  const performAll = useCallback<Writes['performAll']>(
    async (kind, files, what) => {
      if (files.length === 0) return
      if (kind === 'discard' && !(await confirmDiscard(what))) return
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
      if (failed) toast.error(`${failed} of ${files.length} files could not be written`, { description: label })
      else if (kind === 'discard') {
        // Each discarded file left its own snapshot, newest first, so undo takes them all back.
        const restoreAll = async () => {
          const restored: string[] = []
          for (let i = 0; i < files.length - failed; i++) restored.push(...((await api.undo()).restored ?? []))
          if (restored.length)
            toast.success(`Restored ${restored.length} ${restored.length === 1 ? 'file' : 'files'}`, {
              description: restored.join(', '),
            })
          else toast('Nothing left to undo')
          reload()
        }
        toast.success(label, { duration: 10_000, action: { label: 'Undo', onClick: () => void restoreAll() } })
      } else toast.success(label)
      reload()
    },
    [api, reload],
  )

  const performLines = useCallback<Writes['performLines']>(
    async (kind, file, lines) => {
      const count = `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`
      if (kind === 'discard' && !(await confirmDiscard(count, file.path))) return
      try {
        await api.write({
          action: `${kind}-lines`,
          file: { path: file.path, oldPath: file.oldPath, status: file.status, newSha: file.newSha },
          lines,
        })
        const label = `${DONE[kind]} ${count}`
        if (kind === 'discard')
          toast.success(label, {
            description: file.path,
            duration: 10_000,
            action: { label: 'Undo', onClick: () => void undo() },
          })
        else toast.success(label, { description: file.path })
      } catch (error) {
        failedWrite(kind, count, file.path, error)
      }
      reload()
    },
    [api, undo, reload],
  )

  const value = useMemo(() => ({ perform, performAll, undo, performLines }), [perform, performAll, undo, performLines])
  return <WritesContext.Provider value={value}>{children}</WritesContext.Provider>
}

export function useWrites(): Writes {
  const value = useContext(WritesContext)
  if (!value) throw new Error('useWrites needs a WritesProvider')
  return value
}
