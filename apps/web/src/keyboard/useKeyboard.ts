import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { back, forward } from '../lib/history'
import type { View } from '../lib/view-url'
import { lineHash, lineText } from '../review/anchor'
import { resize } from '../settings/resize'
import { BASE_FONT } from '../state/settings'
import { actionsFor, firstChange, type WriteKind } from '../viewer/actions'
import { visibleItems } from '../viewer/visible-items'
import { useWrites } from '../writes/WritesProvider'
import { type Action, type Position, resolveKey, step } from './keymap'

const MOVES = new Set<Action>(['next-hunk', 'prev-hunk', 'next-file', 'prev-file'])
const VIEWS: Partial<Record<Action, View>> = {
  'view-changes': 'changes',
  'view-graph': 'graph',
  'view-files': 'files',
  'view-prs': 'prs',
  'view-issues': 'issues',
  'view-inbox': 'inbox',
  'view-releases': 'releases',
  'view-actions': 'actions',
}
// Everything else acts on the diff, so it only runs where the diff is on screen.
const ANYWHERE = new Set<Action>([
  'palette',
  'help',
  'toggle-sidebar',
  'toggle-panel',
  'font-bigger',
  'font-smaller',
  'font-reset',
  'back',
  'forward',
  ...(Object.keys(VIEWS) as Action[]),
])
const WRITES: Partial<Record<Action, WriteKind>> = { stage: 'stage', unstage: 'unstage', discard: 'discard' }

export function useKeyboard(open: { palette(): void; help(): void; show(view: View): void }) {
  const { api, session, settings, viewer, reviews, viewed, view, panel } = useApp()
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
    // Hidden test files are skipped by j/k, as they are by the eye.
    const shownItems = () => visibleItems(session.get().items, settings.get().tests)
    const onKey = (event: KeyboardEvent) => {
      const action = resolveKey(event)
      if (!action) return
      if (view.get() !== 'changes' && !ANYWHERE.has(action)) return
      event.preventDefault()
      if (action === 'palette') return handlers.current.palette()
      if (action === 'back') return void back()
      if (action === 'forward') return void forward()
      if (action === 'help') return handlers.current.help()
      if (action === 'toggle-panel') return panel.toggle()
      if (action === 'toggle-sidebar') return settings.set((prev) => ({ ...prev, sidebar: !prev.sidebar }))
      if (action === 'font-bigger') return settings.set((prev) => resize(prev, 1))
      if (action === 'font-smaller') return settings.set((prev) => resize(prev, -1))
      if (action === 'font-reset')
        return settings.set((prev) => ({ ...prev, fontSize: BASE_FONT, uiFontSize: BASE_FONT }))
      const destination = VIEWS[action]
      if (destination) return handlers.current.show(destination)
      if (action === 'focus-filter') return document.getElementById('file-filter')?.focus()
      if (action === 'toggle-layout') {
        return settings.set((prev) => ({ ...prev, diffStyle: prev.diffStyle === 'split' ? 'unified' : 'split' }))
      }
      if (!MOVES.has(action)) return onCurrent(action)
      const items = shownItems()
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
      const { files, target } = session.get()
      const items = shownItems()
      const item = items[position.current.item]
      if (!item) return
      const path = item.fileDiff.name
      const file = files.find((entry) => entry.path === path)
      const index = position.current.hunk
      const hunk = item.fileDiff.hunks[index]
      const kind = WRITES[action]
      if (kind) {
        if (!file || file.status === 'conflicted' || !actionsFor(target).includes(kind)) return
        void writes.perform(kind, file, hunk && file.status !== 'untracked' ? { index, hunk } : undefined)
      } else if (action === 'viewed') {
        if (file) viewed.toggle(target, file)
      } else if (hunk && action === 'comment') {
        const { side, line } = firstChange(hunk)
        const text = lineText(item.fileDiff, side, line) ?? ''
        reviews.startDraft({ path, side, line, lineHash: lineHash(text), text })
      } else if (action === 'open') {
        const at = hunk ? firstChange(hunk) : null
        const line = at?.side === 'additions' ? at.line : (hunk?.additionStart ?? 1)
        api.open(path, line).catch((error: Error) => toast.error(error.message))
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [api, session, settings, viewer, reviews, viewed, writes, view, panel])
}
