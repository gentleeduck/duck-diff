import { useEffect, useRef } from 'react'
import { useApp } from '../app/AppProvider'
import { type Action, type Position, resolveKey, step } from './keymap'

const MOVES = new Set<Action>(['next-hunk', 'prev-hunk', 'next-file', 'prev-file'])

export function useKeyboard(open: { palette(): void; help(): void }) {
  const { session, settings, viewer } = useApp()
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
      if (!MOVES.has(action)) return
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
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session, settings, viewer])
}
