import { isInputElement } from '@gentleduck/vim/matcher'
import { useEffect, useRef } from 'react'
import { useApp } from '../app/AppProvider'
import { useOpenFile } from '../hooks/useOpenFile'
import { compileHidden } from '../lib/hide'
import { back, forward } from '../lib/history'
import { MERGE_STEP } from '../merge/merge-model'
import { lineHash, lineText } from '../review/anchor'
import { resize } from '../settings/resize'
import { BASE_FONT, panelShown, togglePanel } from '../state/settings'
import { viewedPaths } from '../state/viewed'
import { focusTerminal } from '../terminal/input'
import { actionsFor, firstChange, type WriteKind } from '../viewer/actions'
import { visibleItems } from '../viewer/visible-items'
import { useWrites } from '../writes/WritesProvider'
import { isBrowserShortcut } from './browser-keys'
import { deepActive, enterList, listOf, type Motion, move as moveIn } from './motions'
import { shortcutFor } from './shortcuts'
import { type Move, type Position, step } from './step'
import { type Direction, nextArea } from './windows'

export interface ShortcutHandlers {
  palette(): void
  shortcuts(): void
}

const stepMerge = (by: number) => window.dispatchEvent(new CustomEvent(MERGE_STEP, { detail: by }))
const region = (name: string) => document.querySelector<HTMLElement>(`[data-region="${name}"]`)
// The panels Ctrl and a direction move between, whichever are on screen.
const AREAS = ['top', 'side', 'main', 'aside', 'panel']
const ARROWS: Record<string, Motion> = { ArrowDown: 'down', ArrowUp: 'up', Home: 'first', End: 'last' }

// The page's keys: one listener for the plain shortcuts in shortcuts.ts, arrows through lists, and nothing left
// for the browser but reload.
export function useShortcuts(handlers: ShortcutHandlers) {
  const app = useApp()
  const openInEditor = useOpenFile()
  const { session, settings, viewer, reviews, viewed, view, panel } = app
  const writes = useWrites()
  const position = useRef<Position>({ item: 0, hunk: 0 })
  const latest = useRef({ handlers, writes })
  latest.current = { handlers, writes }

  useEffect(
    () =>
      session.subscribe(() => {
        if (session.get().status === 'loading') position.current = { item: 0, hunk: 0 }
      }),
    [session],
  )

  useEffect(() => {
    const shownItems = () => visibleItems(session.get().items, compileHidden(settings.get().hidePatterns))
    const current = () => {
      const { files, target } = session.get()
      const item = shownItems()[position.current.item]
      if (!item) return null
      const path = item.fileDiff.name
      const index = position.current.hunk
      return {
        item,
        path,
        target,
        index,
        file: files.find((entry) => entry.path === path),
        hunk: item.fileDiff.hunks[index],
      }
    }
    const move = (action: Move) => {
      const items = shownItems()
      if (items.length === 0) return
      const next = step(
        items.map((item) => ({ hunks: item.fileDiff.hunks })),
        position.current,
        action,
      )
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
    const write = (kind: WriteKind) => {
      const at = current()
      if (!at?.file || at.file.status === 'conflicted' || !actionsFor(at.target).includes(kind)) return
      const hunk = at.hunk && at.file.status !== 'untracked' ? { index: at.index, hunk: at.hunk } : undefined
      void latest.current.writes.perform(kind, at.file, hunk)
    }
    const focusPanel = () => {
      if (!panel.get().open) panel.show()
      const tab = panel.get().tab
      if (tab !== 'output') return focusTerminal(tab)
      requestAnimationFrame(() => region('panel')?.querySelector<HTMLElement>('button, [tabindex]')?.focus())
    }
    const focusSide = () => {
      if (!panelShown(settings.get(), view.get())) settings.set((prev) => togglePanel(prev, view.get(), true))
      requestAnimationFrame(() =>
        region('side')?.querySelector<HTMLElement>('[aria-selected="true"], [role="treeitem"], button, input')?.focus(),
      )
    }
    const focusArea = (name: string) => {
      if (name === 'side') return focusSide()
      if (name === 'panel') return focusPanel()
      if (name === 'main') return region('main')?.focus()
      region(name)?.querySelector<HTMLElement>('input, button, a[href], [tabindex]:not([tabindex="-1"])')?.focus()
    }
    // To the panel on that side, as between Neovim's windows; false when there is none, so a terminal keeps the key.
    const moveFocus = (direction: Direction): boolean => {
      const areas = AREAS.flatMap((name) => {
        const rect = region(name)?.getBoundingClientRect()
        return rect && rect.width > 0 && rect.height > 0 ? [{ name, rect }] : []
      })
      const here = document.activeElement?.closest<HTMLElement>('[data-region]')?.dataset.region
      const from = areas.find((area) => area.name === here) ?? areas.find((area) => area.name === 'main')
      const next = from ? nextArea(areas, from, direction) : null
      if (next) focusArea(next)
      // A hidden side panel or a closed bottom panel opens on the way to it.
      else if (direction === 'left' && here !== 'side' && !panelShown(settings.get(), view.get())) focusSide()
      else if (direction === 'down' && here !== 'panel' && !panel.get().open) focusPanel()
      else if (!here) focusArea('main')
      else return false
      return true
    }

    // Each returns false when it had nothing to do, and the key goes on where it was going.
    const commands: Record<string, () => unknown> = {
      palette: () => latest.current.handlers.palette(),
      shortcuts: () => latest.current.handlers.shortcuts(),
      back: () => void back(),
      forward: () => void forward(),
      'font-bigger': () => settings.set((prev) => resize(prev, 1)),
      'font-smaller': () => settings.set((prev) => resize(prev, -1)),
      'font-reset': () => settings.set((prev) => ({ ...prev, fontSize: BASE_FONT, uiFontSize: BASE_FONT })),
      escape: () => {
        if (reviews.get().draft) reviews.cancelDraft()
        else if (isInputElement(document.activeElement)) (document.activeElement as HTMLElement).blur()
        return false
      },
      'focus-left': () => moveFocus('left'),
      'focus-down': () => moveFocus('down'),
      'focus-up': () => moveFocus('up'),
      'focus-right': () => moveFocus('right'),
      'toggle-sidebar': () => settings.set((prev) => togglePanel(prev, view.get())),
      'toggle-panel': () => {
        panel.toggle()
        const { open, tab } = panel.get()
        // Opening onto a terminal hands it the keyboard, as a terminal pane in an editor does.
        if (open && tab !== 'output') focusTerminal(tab)
        if (!open) (document.activeElement as HTMLElement | null)?.blur?.()
      },
      'next-hunk': () => (view.get() === 'merge' ? stepMerge(1) : move('next-hunk')),
      'prev-hunk': () => (view.get() === 'merge' ? stepMerge(-1) : move('prev-hunk')),
      'next-file': () => move('next-file'),
      'prev-file': () => move('prev-file'),
      stage: () => write('stage'),
      unstage: () => write('unstage'),
      discard: () => write('discard'),
      comment: () => {
        const at = current()
        if (!at?.hunk) return
        const { side, line } = firstChange(at.hunk)
        const text = lineText(at.item.fileDiff, side, line) ?? ''
        reviews.startDraft({ path: at.path, side, line, lineHash: lineHash(text), text })
      },
      viewed: () => {
        const at = current()
        if (!at?.file) return
        const marking = !viewedPaths(viewed.get(), at.target, [at.file]).has(at.file.path)
        viewed.toggle(at.target, at.file)
        if (marking) requestAnimationFrame(() => viewer.current?.reveal(at.item.id))
      },
      open: () => {
        const at = current()
        if (!at) return
        const change = at.hunk ? firstChange(at.hunk) : null
        const line = change?.side === 'additions' ? change.line : (at.hunk?.additionStart ?? 1)
        void openInEditor(at.path, line)
      },
      'toggle-layout': () =>
        settings.set((prev) => ({ ...prev, diffStyle: prev.diffStyle === 'split' ? 'unified' : 'split' })),
      'focus-filter': () => document.getElementById('file-filter')?.focus(),
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const target = event.target instanceof Element ? event.target : null
      const terminal = Boolean(target?.closest('.xterm'))
      const typing = !terminal && isInputElement(target)
      // Dialogs, menus and the line selection's bar own their keys, Escape above all.
      if (!terminal && !typing && document.querySelector('[data-selection-bar]')) return
      if (!terminal && target?.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
      const shortcut = shortcutFor(event)
      if (!shortcut) return
      if ((terminal && !shortcut.terminal) || (typing && !shortcut.typing)) return
      if (shortcut.views && !shortcut.views.includes(view.get())) return
      if (commands[shortcut.id]?.() === false) return
      event.preventDefault()
      // A shell must not see a key the page took.
      if (terminal) event.stopPropagation()
    }
    // Arrows through a list that does not move with them itself, once it has had the chance (bubbling, after it).
    const onArrow = (event: KeyboardEvent) => {
      const motion = ARROWS[event.key]
      if (!motion || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      const active = deepActive()
      if (isInputElement(active) || active?.closest('.xterm, [role="dialog"], [role="menu"]')) return
      const handled = listOf(active)
        ? moveIn(motion, active)
        : (motion === 'down' || motion === 'first') &&
            (!active || active === document.body || active === region('main'))
          ? enterList(region('main'))
          : false
      if (handled) event.preventDefault()
    }
    // Last of all, once the page and a terminal have had the key: what is left for the browser stays unused.
    const onLeftover = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if (isBrowserShortcut(event, isInputElement(event.target))) event.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keydown', onArrow)
    window.addEventListener('keydown', onLeftover)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keydown', onArrow)
      window.removeEventListener('keydown', onLeftover)
    }
  }, [session, settings, viewer, reviews, viewed, view, panel, openInEditor])
}
