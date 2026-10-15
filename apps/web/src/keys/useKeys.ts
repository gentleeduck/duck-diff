import { isInputElement } from '@gentleduck/vim/matcher'
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { blameRef } from '../blame/ref'
import { useGit } from '../git/GitProvider'
import { useTarget } from '../hooks/useTarget'
import { glide } from '../lib/glide'
import { compileHidden } from '../lib/hide'
import { back, forward } from '../lib/history'
import type { View } from '../lib/view-url'
import { lineHash, lineText } from '../review/anchor'
import { resize } from '../settings/resize'
import { BASE_FONT } from '../state/settings'
import { ROOT } from '../state/tabs'
import { viewedPaths } from '../state/viewed'
import { focusedTerminal, focusTerminal, sendToTerminal } from '../terminal/input'
import { actionsFor, firstChange, type WriteKind } from '../viewer/actions'
import { visibleItems } from '../viewer/visible-items'
import { useWrites } from '../writes/WritesProvider'
import { buildBindings } from './bindings'
import { COMMANDS, PASS_THROUGH } from './commands'
import { createDispatcher, eventKey, type Mode } from './engine'
import { deepActive, enterList, listOf, type Motion, move as moveIn, scrollHalf } from './motions'
import { type Move, type Position, step } from './step'

export interface KeyHandlers {
  palette(initial?: string): void
  resume(): void
  keymaps(): void
  show(view: View): void
}

const VIEWS: Record<string, View> = {
  'view-changes': 'changes',
  'view-graph': 'graph',
  'view-files': 'files',
  'view-prs': 'prs',
  'view-issues': 'issues',
  'view-inbox': 'inbox',
  'view-releases': 'releases',
  'view-actions': 'actions',
}
const MOVES = new Set(['next-hunk', 'prev-hunk', 'next-file', 'prev-file'])
const WRITES: Record<string, WriteKind> = { stage: 'stage', unstage: 'unstage', discard: 'discard' }
// Keys the page held for a chord that never came, as the shell would have received them.
const BYTES: Record<string, string> = { esc: '\x1b', enter: '\r', tab: '\t', backspace: '\x7f', space: ' ' }

export function modeOf(target: EventTarget | null): Mode {
  const element = target instanceof Element ? target : null
  if (element?.closest('.xterm')) return 'terminal'
  return isInputElement(element) ? 'insert' : 'normal'
}

const region = (name: string) => document.querySelector<HTMLElement>(`[data-region="${name}"]`)
const diffScroller = () => document.querySelector<HTMLElement>('[data-diff-view]')

// One capture listener drives the page from the keyboard the way the user's Neovim does.
export function useKeys(handlers: KeyHandlers) {
  const app = useApp()
  const {
    api,
    session,
    settings,
    viewer,
    reviews,
    viewed,
    view,
    panel,
    terminalTabs,
    keys,
    keyOverrides,
    tabs,
    blameFiles,
  } = app
  const writes = useWrites()
  const git = useGit()
  const { navigate } = useTarget()
  const position = useRef<Position>({ item: 0, hunk: 0 })
  const runner = useRef<(id: string) => void>(() => {})
  const latest = useRef({ handlers, writes, git, navigate })
  latest.current = { handlers, writes, git, navigate }

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
    const write = (kind: WriteKind, wholeFile: boolean) => {
      const at = current()
      if (!at?.file || at.file.status === 'conflicted' || !actionsFor(at.target).includes(kind)) return
      const hunk =
        !wholeFile && at.hunk && at.file.status !== 'untracked' ? { index: at.index, hunk: at.hunk } : undefined
      void latest.current.writes.perform(kind, at.file, hunk)
    }
    const switchTab = (by: 1 | -1) => {
      const { tabs: list, active } = tabs.get()
      const at = list.findIndex((tab) => tab.id === active)
      const next = list[(at + by + list.length) % list.length]
      if (next && next.id !== active) latest.current.navigate(next.target)
    }
    const openTerminal = (fresh: boolean) => {
      const existing = terminalTabs.get().tabs.at(-1)
      const key = !fresh && existing ? existing.key : terminalTabs.add().key
      panel.show(key)
      focusTerminal(key)
    }
    const focusPanel = () => {
      if (!panel.get().open) panel.show()
      const tab = panel.get().tab
      if (tab !== 'output') return focusTerminal(tab)
      requestAnimationFrame(() => region('panel')?.querySelector<HTMLElement>('button, [tabindex]')?.focus())
    }
    const blur = () => (document.activeElement as HTMLElement | null)?.blur?.()

    const commands: Record<string, () => void> = {
      top: () => {
        const scroller = diffScroller()
        if (scroller) void glide(scroller, 0)
      },
      bottom: () => {
        const scroller = diffScroller()
        if (scroller) void glide(scroller, scroller.scrollHeight - scroller.clientHeight)
      },
      'half-down': () => {
        const scroller = diffScroller()
        if (scroller) void glide(scroller, scroller.scrollTop + scroller.clientHeight / 2)
      },
      'half-up': () => {
        const scroller = diffScroller()
        if (scroller) void glide(scroller, Math.max(0, scroller.scrollTop - scroller.clientHeight / 2))
      },
      back: () => void back(),
      forward: () => void forward(),
      'stage-file': () => write('stage', true),
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
        api.open(at.path, line).catch((error: Error) => toast.error(error.message))
      },
      blame: () => {
        const at = current()
        if (!at || blameRef(at.target) === null) return
        blameFiles.set((prev) => {
          const next = new Set(prev)
          if (!next.delete(at.path)) next.add(at.path)
          return next
        })
      },
      'yank-path': () => {
        const at = current()
        if (!at) return
        navigator.clipboard.writeText(at.path).then(
          () => toast(`Copied ${at.path}`),
          () => {},
        )
      },
      'toggle-layout': () =>
        settings.set((prev) => ({ ...prev, diffStyle: prev.diffStyle === 'split' ? 'unified' : 'split' })),
      'focus-filter': () => document.getElementById('file-filter')?.focus(),
      commit: () => {
        latest.current.handlers.show('changes')
        requestAnimationFrame(() => document.querySelector<HTMLElement>('form[aria-label="Commit"] textarea')?.focus())
      },
      push: () => void latest.current.git.run('push', undefined, 'Pushed'),
      pull: () => void latest.current.git.run('pull', undefined, 'Pulled'),
      'pull-rebase': () => void latest.current.git.run('pull', { rebase: true }, 'Pulled with rebase'),
      fetch: () => void latest.current.git.run('fetch', undefined, 'Fetched from every remote'),
      palette: () => latest.current.handlers.palette(),
      'search-files': () => latest.current.handlers.palette('file:'),
      'search-changed': () => latest.current.handlers.palette(),
      'search-commands': () => latest.current.handlers.palette('>'),
      'search-resume': () => latest.current.handlers.resume(),
      keymaps: () => latest.current.handlers.keymaps(),
      'command-line': () => keys.set((state) => ({ ...state, commandLine: true })),
      'tab-next': () => switchTab(1),
      'tab-prev': () => switchTab(-1),
      'tab-close': () => {
        const { active } = tabs.get()
        if (active === ROOT) return
        const next = tabs.close(active)
        if (next) latest.current.navigate(next.target, true)
      },
      'terminal-new': () => openTerminal(true),
      'terminal-toggle': () => openTerminal(false),
      'toggle-panel': () => {
        panel.toggle()
        const { open, tab } = panel.get()
        // Opening onto a terminal hands it the keyboard, as a terminal pane in an editor does.
        if (open && tab !== 'output') focusTerminal(tab)
        if (!open) blur()
      },
      'leave-terminal': () => {
        blur()
        region('main')?.focus()
      },
      'leave-insert': blur,
      'focus-left': () => {
        if (!settings.get().sidebar) settings.set((prev) => ({ ...prev, sidebar: true }))
        requestAnimationFrame(() =>
          region('side')
            ?.querySelector<HTMLElement>('[aria-selected="true"], [role="treeitem"], button, input')
            ?.focus(),
        )
      },
      'focus-right': () => region('main')?.focus(),
      'focus-down': focusPanel,
      'focus-up': () => region('main')?.focus(),
      'toggle-sidebar': () => settings.set((prev) => ({ ...prev, sidebar: !prev.sidebar })),
      'font-bigger': () => settings.set((prev) => resize(prev, 1)),
      'font-smaller': () => settings.set((prev) => resize(prev, -1)),
      'font-reset': () => settings.set((prev) => ({ ...prev, fontSize: BASE_FONT, uiFontSize: BASE_FONT })),
    }
    const walk = (motion: Motion) => {
      if (!listOf(deepActive()) && (motion === 'down' || motion === 'first')) return void enterList(region('main'))
      moveIn(motion)
    }
    commands['item-down'] = () => walk('down')
    commands['item-up'] = () => walk('up')
    commands['item-left'] = () => walk('left')
    commands['item-right'] = () => walk('right')
    commands['item-first'] = () => walk('first')
    commands['item-last'] = () => walk('last')
    commands['list-half-down'] = () => scrollHalf(1)
    commands['list-half-up'] = () => scrollHalf(-1)
    for (const [id, destination] of Object.entries(VIEWS))
      commands[id] = () => latest.current.handlers.show(destination)
    for (const id of MOVES) commands[id] = () => move(id as Move)
    for (const [id, kind] of Object.entries(WRITES)) commands[id] = () => write(kind, false)
    runner.current = (id) => commands[id]?.()

    const contexts = {
      anywhere: () => true,
      diff: () => view.get() === 'changes',
      panel: () => Boolean(document.activeElement?.closest('[data-region="panel"]')),
      list: () => {
        const active = deepActive()
        if (listOf(active)) return true
        const idle = !active || active === document.body || active === region('main')
        return idle && view.get() !== 'changes'
      },
    }
    let ran: string | null = null
    const build = () =>
      createDispatcher(buildBindings(COMMANDS, keyOverrides.get(), contexts), {
        timeoutMs: 500,
        run: (id) => {
          ran = id
          commands[id]?.()
        },
        drop: (held) => {
          const terminal = focusedTerminal()
          if (!terminal) return
          sendToTerminal(terminal, held.map((key) => BYTES[key] ?? (key.length === 1 ? key : '')).join(''))
        },
      })
    let dispatcher = build()
    const showPending = () => keys.set((state) => ({ ...state, pending: [...dispatcher.pending()] }))
    let unwatch = dispatcher.subscribe(showPending)
    const rebuild = keyOverrides.subscribe(() => {
      unwatch()
      dispatcher.reset()
      dispatcher = build()
      unwatch = dispatcher.subscribe(showPending)
    })

    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const target = event.target instanceof Element ? event.target : null
      const mode = modeOf(target)
      // Dialogs, menus and the line selection's bar own their keys, Escape above all, so the page stays out.
      if (mode === 'normal' && document.querySelector('[data-selection-bar]')) return
      if (mode !== 'terminal' && target?.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
      const key = eventKey(event)
      if (!key) return
      ran = null
      const result = dispatcher.feed(key, mode)
      if (result === 'none' || (ran && PASS_THROUGH.has(ran))) return
      event.preventDefault()
      // A shell must not see keys the page took, or the first Esc of <Esc><Esc> would reach it twice.
      if (mode === 'terminal') event.stopPropagation()
    }
    const onFocus = () => {
      const mode = modeOf(document.activeElement)
      if (keys.get().mode !== mode) keys.set((state) => ({ ...state, mode }))
    }
    // Focus can leave to nothing (a blur), which only shows once the frame settles.
    const onBlur = () => requestAnimationFrame(onFocus)
    // A click elsewhere abandons a half-typed chord.
    const onPointer = () => dispatcher.pending().length && dispatcher.reset()
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
      window.removeEventListener('pointerdown', onPointer, true)
      unwatch()
      rebuild()
      dispatcher.reset()
    }
  }, [api, session, settings, viewer, reviews, viewed, view, panel, terminalTabs, keys, keyOverrides, tabs, blameFiles])

  // Runs a command by id, for the keymaps list.
  return useCallback((id: string) => runner.current(id), [])
}
