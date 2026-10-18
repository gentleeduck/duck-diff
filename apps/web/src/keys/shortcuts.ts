import { matchesKeyboardEvent } from '@gentleduck/vim/matcher'
import { parseKeyBind } from '@gentleduck/vim/parser'
import type { View } from '../router/place'

export interface Shortcut {
  id: string
  title: string
  group: 'General' | 'Panels' | 'Changes'
  // duck-vim bindings, the first is the one shown. Mod is Cmd on a Mac and Ctrl elsewhere.
  keys: string[]
  // Only on these pages.
  views?: View[]
  // Also while typing in a text box, and in a terminal; every other key belongs to them there.
  typing?: boolean
  terminal?: boolean
}

const CHANGES: View[] = ['changes']
// Stepping and the layout work on the merge page as well, through its conflicts.
const MERGING: View[] = ['changes', 'merge']
const MERGE: View[] = ['merge']

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

  { id: 'next-hunk', title: 'Next change, or conflict when merging', group: 'Changes', keys: ['j'], views: MERGING },
  {
    id: 'prev-hunk',
    title: 'Previous change, or conflict when merging',
    group: 'Changes',
    keys: ['k'],
    views: MERGING,
  },
  { id: 'next-file', title: 'Next file', group: 'Changes', keys: ['shift+j'], views: CHANGES },
  { id: 'prev-file', title: 'Previous file', group: 'Changes', keys: ['shift+k'], views: CHANGES },
  { id: 'stage', title: 'Stage the change', group: 'Changes', keys: ['s'], views: CHANGES },
  { id: 'unstage', title: 'Unstage the change', group: 'Changes', keys: ['u'], views: CHANGES },
  { id: 'discard', title: 'Discard the change', group: 'Changes', keys: ['x'], views: CHANGES },
  { id: 'comment', title: 'Comment on the change', group: 'Changes', keys: ['c'], views: CHANGES },
  { id: 'viewed', title: 'Mark the file viewed', group: 'Changes', keys: ['v'], views: CHANGES },
  { id: 'open', title: 'Open the change in your editor', group: 'Changes', keys: ['o'], views: CHANGES },
  { id: 'toggle-layout', title: 'Split or stacked', group: 'Changes', keys: ['t'], views: MERGING },
  { id: 'toggle-blame', title: 'Blame the file at the top while merging', group: 'Changes', keys: ['b'], views: MERGE },
  { id: 'focus-filter', title: 'Filter files', group: 'Changes', keys: ['/'], views: CHANGES },
]

const PARSED = SHORTCUTS.flatMap((shortcut) => shortcut.keys.map((key) => ({ shortcut, parsed: parseKeyBind(key) })))

export function shortcutFor(event: KeyboardEvent): Shortcut | null {
  return PARSED.find(({ parsed }) => matchesKeyboardEvent(parsed, event))?.shortcut ?? null
}
