import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { lineHash, lineText } from '../review/anchor'
import { actionsFor, firstChange, type WriteKind } from '../viewer/actions'
import { useWrites } from '../writes/WritesProvider'
import { type Action, type Position, resolveKey, step } from './keymap'

const MOVES = new Set<Action>(['next-hunk', 'prev-hunk', 'next-file', 'prev-file'])
const WRITES: Partial<Record<Action, WriteKind>> = { stage: 'stage', unstage: 'unstage', discard: 'discard' }

export function useKeyboard(open: { palette(): void; help(): void }) {
  const { api, session, settings, viewer, reviews, viewed } = useApp()
  const writes = useWrites()
  const position = useRef<Position>({ item: 0, hunk: 0 })
  const handlers = useRef(open)
  handlers.current = open

  // A new comparison starts navigation from the top again.
  useEffect(
    () =>
      session.subscribe(() => {
        if (session.get().status === 'loading') position.current = { item: 0, hunk: 0 }
      }),
    [session],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = resolveKey(event)
      if (!action) return
      event.preventDefault()
      if (action === 'palette') return handlers.current.palette()
      if (action === 'help') return handlers.current.help()
      if (action === 'focus-filter') return document.getElementById('file-filter')?.focus()
      if (action === 'toggle-layout') {
        return settings.set((prev) => ({ ...prev, diffStyle: prev.diffStyle === 'split' ? 'unified' : 'split' }))
      }
      if (!MOVES.has(action)) return onCurrent(action)
      const items = session.get().items
      if (items.length === 0) return
      const nav = items.map((item) => ({ hunks: item.fileDiff.hunks }))
      const next = step(nav, position.current, action)
      position.current = next
      const item = items[next.item]
      const hunk = item?.fileDiff.hunks[next.hunk]
      if (!item) return
      viewer.current?.scrollTo(
        hunk
          ? { type: 'line', id: item.id, lineNumber: hunk.additionStart, side: 'additions', align: 'start' }
          : { type: 'item', id: item.id, align: 'start' },
      )
    }
    // The rest act on the change that j/k last landed on.
    const onCurrent = (action: Action) => {
      const { items, files, target } = session.get()
      const item = items[position.current.item]
      if (!item) return
      const path = item.fileDiff.name
      const file = files.find((entry) => entry.path === path)
      const index = position.current.hunk
      const hunk = item.fileDiff.hunks[index]
      const kind = WRITES[action]
      if (kind) {
        if (!file || !actionsFor(target).includes(kind)) return
        void writes.perform(kind, file, hunk && file.status !== 'untracked' ? { index, hunk } : undefined)
      } else if (action === 'viewed') {
        if (file) viewed.toggle(target, file)
      } else if (hunk && action === 'comment') {
        const { side, line } = firstChange(hunk)
        reviews.startDraft({ path, side, line, lineHash: lineHash(lineText(item.fileDiff, side, line) ?? '') })
      } else if (action === 'open') {
        const at = hunk ? firstChange(hunk) : null
        const line = at?.side === 'additions' ? at.line : (hunk?.additionStart ?? 1)
        api.open(path, line).catch((error: Error) => toast.error(error.message))
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [api, session, settings, viewer, reviews, viewed, writes])
}
