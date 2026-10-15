import type { ChangedFile, DiffTarget } from '@duck-diff/protocol'
import { Progress } from '@duck-diff/ui'
import { ArrowDownToLine, CircleCheck } from 'lucide-react'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import { type ViewedState, viewedPaths } from '../state/viewed'
import { treeOrder } from './tree-model'

const selectViewed = (state: ViewedState) => state

// How many of the shown files are viewed, and the first one not yet, as the tree orders them.
export function reviewProgress(files: readonly ChangedFile[], viewed: ReadonlySet<string>) {
  const order = treeOrder(files.map((file) => file.path))
  const sorted = [...files].sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0))
  const done = files.filter((file) => viewed.has(file.path)).length
  return { done, total: files.length, next: sorted.find((file) => !viewed.has(file.path))?.path ?? null }
}

// GitHub's "files viewed" count with a bar; clicking it goes to the next file to read.
export function ViewedProgress({ files, target }: { files: readonly ChangedFile[]; target: DiffTarget }) {
  const { viewed, diffFile } = useApp()
  const state = useStore(viewed, selectViewed)
  const { done, total, next } = reviewProgress(files, viewedPaths(state, target, files))
  if (!total) return null
  const finished = done === total
  return (
    <button
      type="button"
      disabled={finished}
      onClick={() => next && diffFile.set(next)}
      title={finished ? 'Every file is viewed' : `Go to ${next}, the next file not viewed`}
      className="flex w-full cursor-pointer flex-col gap-1 rounded-sm text-start text-muted-foreground hover:text-foreground disabled:cursor-default">
      <span className="flex w-full items-center gap-1.5">
        {finished ? <CircleCheck className="size-4 text-tn-green" /> : null}
        <span className="tabular-nums">
          <span className={finished ? 'text-tn-green' : 'text-foreground'}>{done}</span> / {total} viewed
        </span>
        {finished ? null : <ArrowDownToLine className="ms-auto size-4" />}
      </span>
      <Progress
        value={(done / total) * 100}
        aria-label={`${done} of ${total} files viewed`}
        className={`h-1 ${finished ? '[&>*]:bg-tn-green' : ''}`}
      />
    </button>
  )
}
