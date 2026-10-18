import { matchesKeyboardEvent } from '@gentleduck/vim/matcher'
import { parseKeyBind } from '@gentleduck/vim/parser'

export interface Shortcut {
  id: string
  title: string
  group: 'General' | 'Panels' | 'Changes'
  // duck-vim bindings, the first is the one shown. Mod is Cmd on a Mac and Ctrl elsewhere.
  keys: string[]
  // On the changes page only.
  diff?: boolean
  // Also while typing in a text box, and in a terminal; every other key belongs to them there.
  typing?: boolean
  terminal?: boolean
}

// Every key the page answers. No chords, modes or remapping: a key does one thing.
export const SHORTCUTS: Shortcut[] = [
  {
    id: 'palette',
    title: 'Search files, pull requests and commands',
    group: 'General',
    keys: ['mod+p', 'ctrl+p', 'meta+k'],
    typing: true,
  },
  { id: 'shortcuts', title: 'Keyboard shortcuts', group: 'General', keys: ['?', 'shift+?'] },
  { id: 'back', title: 'Back', group: 'General', keys: ['alt+arrowleft'] },
  { id: 'forward', title: 'Forward', group: 'General', keys: ['alt+arrowright'] },
  { id: 'font-bigger', title: 'Bigger text', group: 'General', keys: ['mod+='], typing: true },
  { id: 'font-smaller', title: 'Smaller text', group: 'General', keys: ['mod+-'], typing: true },
  { id: 'font-reset', title: 'Default text size', group: 'General', keys: ['mod+0'], typing: true },
  {
    id: 'escape',
    title: 'Leave the text box, or close the comment being written',
    group: 'General',
    keys: ['escape'],
    typing: true,
  },

  { id: 'focus-left', title: 'Panel to the left', group: 'Panels', keys: ['ctrl+h'], terminal: true },
  { id: 'focus-down', title: 'Panel below', group: 'Panels', keys: ['ctrl+j'], terminal: true },
  { id: 'focus-up', title: 'Panel above', group: 'Panels', keys: ['ctrl+k'], terminal: true },
  { id: 'focus-right', title: 'Panel to the right', group: 'Panels', keys: ['ctrl+l'], terminal: true },
  { id: 'toggle-sidebar', title: 'Show or hide the side panel', group: 'Panels', keys: ['mod+b'], typing: true },
  {
    id: 'toggle-panel',
    title: 'Show or hide the bottom panel',
    group: 'Panels',
    keys: ['ctrl+`'],
    typing: true,
    terminal: true,
  },

  { id: 'next-hunk', title: 'Next change', group: 'Changes', keys: ['j'], diff: true },
  { id: 'prev-hunk', title: 'Previous change', group: 'Changes', keys: ['k'], diff: true },
  { id: 'next-file', title: 'Next file', group: 'Changes', keys: ['shift+j'], diff: true },
  { id: 'prev-file', title: 'Previous file', group: 'Changes', keys: ['shift+k'], diff: true },
  { id: 'stage', title: 'Stage the change', group: 'Changes', keys: ['s'], diff: true },
  { id: 'unstage', title: 'Unstage the change', group: 'Changes', keys: ['u'], diff: true },
  { id: 'discard', title: 'Discard the change', group: 'Changes', keys: ['x'], diff: true },
  { id: 'comment', title: 'Comment on the change', group: 'Changes', keys: ['c'], diff: true },
  { id: 'viewed', title: 'Mark the file viewed', group: 'Changes', keys: ['v'], diff: true },
  { id: 'open', title: 'Open the change in your editor', group: 'Changes', keys: ['o'], diff: true },
  { id: 'toggle-layout', title: 'Split or stacked', group: 'Changes', keys: ['t'], diff: true },
  { id: 'focus-filter', title: 'Filter files', group: 'Changes', keys: ['/'], diff: true },
]

const PARSED = SHORTCUTS.flatMap((shortcut) => shortcut.keys.map((key) => ({ shortcut, parsed: parseKeyBind(key) })))

export function shortcutFor(event: KeyboardEvent): Shortcut | null {
  return PARSED.find(({ parsed }) => matchesKeyboardEvent(parsed, event))?.shortcut ?? null
}
