import type { Mode } from './engine'

// list: focus is in a tree, a list or tabs, or nothing is focused on a page without a diff.
export type Context = 'anywhere' | 'diff' | 'panel' | 'list'

export interface CommandSpec {
  id: string
  title: string
  group: string
  // Vim notation; the first is the one menus show.
  keys: string[]
  modes?: Mode[]
  when?: Context
}

// Every keyed action on the page. Defaults follow the user's Neovim: Space leader, <leader>s search,
// <leader>g git, <leader>h hunks, <leader>t tabs, ]c and [c for changes, <Esc><Esc> out of a terminal.
export const COMMANDS: CommandSpec[] = [
  { id: 'item-down', title: 'Next item', group: 'Lists', keys: ['j'], when: 'list' },
  { id: 'item-up', title: 'Previous item', group: 'Lists', keys: ['k'], when: 'list' },
  { id: 'item-left', title: 'Close the folder, or the tab to the left', group: 'Lists', keys: ['h'], when: 'list' },
  { id: 'item-right', title: 'Open the folder, or the tab to the right', group: 'Lists', keys: ['l'], when: 'list' },
  { id: 'item-first', title: 'First item', group: 'Lists', keys: ['gg'], when: 'list' },
  { id: 'item-last', title: 'Last item', group: 'Lists', keys: ['G'], when: 'list' },
  { id: 'list-half-down', title: 'Half a page down', group: 'Lists', keys: ['<C-d>'], when: 'list' },
  { id: 'list-half-up', title: 'Half a page up', group: 'Lists', keys: ['<C-u>'], when: 'list' },

  { id: 'next-hunk', title: 'Next change', group: 'Move', keys: ['j', ']c'], when: 'diff' },
  { id: 'prev-hunk', title: 'Previous change', group: 'Move', keys: ['k', '[c'], when: 'diff' },
  { id: 'next-file', title: 'Next file', group: 'Move', keys: ['J', ']f'], when: 'diff' },
  { id: 'prev-file', title: 'Previous file', group: 'Move', keys: ['K', '[f'], when: 'diff' },
  { id: 'top', title: 'Top of the diff', group: 'Move', keys: ['gg'], when: 'diff' },
  { id: 'bottom', title: 'Bottom of the diff', group: 'Move', keys: ['G'], when: 'diff' },
  { id: 'half-down', title: 'Half a page down', group: 'Move', keys: ['<C-d>'], when: 'diff' },
  { id: 'half-up', title: 'Half a page up', group: 'Move', keys: ['<C-u>'], when: 'diff' },
  { id: 'back', title: 'Back', group: 'Move', keys: ['<A-Left>'], modes: ['normal', 'insert'] },
  { id: 'forward', title: 'Forward', group: 'Move', keys: ['<A-Right>'], modes: ['normal', 'insert'] },

  { id: 'stage', title: 'Stage the change', group: 'Hunks', keys: ['s', '<leader>hs'], when: 'diff' },
  { id: 'unstage', title: 'Unstage the change', group: 'Hunks', keys: ['u', '<leader>hu'], when: 'diff' },
  { id: 'discard', title: 'Discard the change', group: 'Hunks', keys: ['x', '<leader>hr'], when: 'diff' },
  { id: 'stage-file', title: 'Stage the whole file', group: 'Hunks', keys: ['<leader>hS'], when: 'diff' },
  { id: 'comment', title: 'Comment on the change', group: 'Hunks', keys: ['c'], when: 'diff' },
  { id: 'viewed', title: 'Mark the file viewed', group: 'Hunks', keys: ['v'], when: 'diff' },
  { id: 'open', title: 'Open the change in your editor', group: 'Hunks', keys: ['o'], when: 'diff' },
  { id: 'blame', title: 'Blame the file', group: 'Hunks', keys: ['<leader>hb'], when: 'diff' },
  { id: 'yank-path', title: 'Copy the file path', group: 'Hunks', keys: ['<leader>y'], when: 'diff' },
  { id: 'toggle-layout', title: 'Split or stacked', group: 'Hunks', keys: ['t'], when: 'diff' },
  { id: 'focus-filter', title: 'Filter files', group: 'Hunks', keys: ['/'], when: 'diff' },

  { id: 'view-changes', title: 'Changes', group: 'Views', keys: ['1', '<leader>gs'] },
  { id: 'view-graph', title: 'Commit graph', group: 'Views', keys: ['2', '<leader>gg'] },
  { id: 'view-files', title: 'Files', group: 'Views', keys: ['3', '<leader>gf'] },
  { id: 'view-prs', title: 'Pull requests', group: 'Views', keys: ['4', '<leader>gp'] },
  { id: 'view-issues', title: 'Issues', group: 'Views', keys: ['5', '<leader>gi'] },
  { id: 'view-inbox', title: 'Notifications', group: 'Views', keys: ['6', '<leader>gn'] },
  { id: 'view-releases', title: 'Releases', group: 'Views', keys: ['7', '<leader>gr'] },
  { id: 'view-actions', title: 'Actions', group: 'Views', keys: ['8', '<leader>ga'] },

  { id: 'commit', title: 'Write the commit message', group: 'Git', keys: ['<leader>gc'] },
  // Not <leader>p and <leader>P: those start <leader>pv, and a key that is also the start of another runs only after
  // a pause, which for a push is one keystroke too easy.
  { id: 'push', title: 'Push', group: 'Git', keys: ['<leader>gP'] },
  { id: 'pull', title: 'Pull', group: 'Git', keys: ['<leader>gl'] },
  { id: 'pull-rebase', title: 'Pull with rebase', group: 'Git', keys: ['<leader>gL'] },
  { id: 'fetch', title: 'Fetch every remote', group: 'Git', keys: ['<leader>gF'] },

  {
    id: 'palette',
    title: 'Search everything',
    group: 'Search',
    keys: ['<C-p>', '<D-k>', '<D-p>', '<leader>sg'],
    modes: ['normal', 'insert'],
  },
  { id: 'search-files', title: 'Files', group: 'Search', keys: ['<leader>sf'] },
  { id: 'search-changed', title: 'Changed files', group: 'Search', keys: ['<leader><leader>'] },
  { id: 'search-commands', title: 'Commands', group: 'Search', keys: ['<leader>sc'] },
  { id: 'search-resume', title: 'Resume the last search', group: 'Search', keys: ['<leader>sr'] },
  { id: 'keymaps', title: 'Keymaps', group: 'Search', keys: ['?', '<leader>sk'] },
  { id: 'command-line', title: 'Command line', group: 'Search', keys: [':'] },

  { id: 'tab-next', title: 'Next diff tab', group: 'Tabs', keys: ['<leader>t.', 'gt'] },
  { id: 'tab-prev', title: 'Previous diff tab', group: 'Tabs', keys: ['<leader>t,', 'gT'] },
  { id: 'tab-close', title: 'Close the diff tab', group: 'Tabs', keys: ['<leader>tc'] },
  { id: 'terminal-new', title: 'New terminal', group: 'Tabs', keys: ['<leader>tn'] },
  { id: 'terminal-toggle', title: 'Terminal', group: 'Tabs', keys: ['<leader>tt'] },
  {
    id: 'toggle-panel',
    title: 'Show or hide the bottom panel',
    group: 'Windows',
    keys: ['<C-`>'],
    modes: ['normal', 'insert', 'terminal'],
  },
  { id: 'leave-terminal', title: 'Leave the terminal', group: 'Windows', keys: ['<Esc><Esc>'], modes: ['terminal'] },
  { id: 'leave-insert', title: 'Leave the text box', group: 'Windows', keys: ['<Esc>'], modes: ['insert'] },
  { id: 'close-draft', title: 'Close the comment being written', group: 'Windows', keys: ['<Esc>'] },
  // Ctrl and a direction move between the panels as between Neovim's windows or tmux's panes, a terminal's too;
  // with no panel on that side a terminal keeps the key (Ctrl+L still clears it at the edge). A text box keeps
  // them, as Neovim's insert mode does (Ctrl+K adds a link in a comment): Esc first.
  {
    id: 'focus-left',
    title: 'Panel to the left',
    group: 'Windows',
    keys: ['<C-h>', '<leader>l'],
    modes: ['normal', 'terminal'],
  },
  { id: 'focus-down', title: 'Panel below', group: 'Windows', keys: ['<C-j>'], modes: ['normal', 'terminal'] },
  { id: 'focus-up', title: 'Panel above', group: 'Windows', keys: ['<C-k>'], modes: ['normal', 'terminal'] },
  { id: 'focus-right', title: 'Panel to the right', group: 'Windows', keys: ['<C-l>'], modes: ['normal', 'terminal'] },
  {
    id: 'toggle-sidebar',
    title: 'Hide or show the side panel',
    group: 'Windows',
    keys: ['<C-b>', '<leader>pv'],
    modes: ['normal', 'insert'],
  },
  {
    id: 'font-bigger',
    title: 'Bigger text',
    group: 'Windows',
    keys: ['<C-=>', '<C-+>', '<D-=>'],
    modes: ['normal', 'insert'],
  },
  {
    id: 'font-smaller',
    title: 'Smaller text',
    group: 'Windows',
    keys: ['<C-->', '<D-->'],
    modes: ['normal', 'insert'],
  },
  {
    id: 'font-reset',
    title: 'Default text size',
    group: 'Windows',
    keys: ['<C-0>', '<D-0>'],
    modes: ['normal', 'insert'],
  },
]

// Names which-key shows for a prefix, keyed by its keys joined with spaces.
export const PREFIXES: Record<string, string> = {
  space: 'leader',
  'space s': 'search',
  'space g': 'git and views',
  'space h': 'hunks',
  'space t': 'tabs and terminals',
  'space p': 'project',
  ']': 'next',
  '[': 'previous',
  g: 'go',
}

// Keys commands run with when they are not chords; the event goes on to the page as well.
export const PASS_THROUGH = new Set(['leave-insert', 'close-draft'])
