// What `:` understands, named like vim and fugitive where there is a match.
export type Ex =
  | { kind: 'write'; message: string }
  | { kind: 'quit' }
  | { kind: 'shell'; command: string }
  | { kind: 'terminal' }
  | { kind: 'edit'; path: string }
  | { kind: 'set'; option: string }
  | { kind: 'keymaps' }
  | { kind: 'tab'; step: 1 | -1 }
  | { kind: 'unknown'; text: string }
  | { kind: 'none' }

export interface ExCommand {
  name: string
  // What Tab puts in the line; commands that take an argument end in a space.
  insert: string
  usage: string
  label: string
}

export const EX_COMMANDS: ExCommand[] = [
  {
    name: 'write',
    insert: 'w ',
    usage: ':w [message]',
    label: 'Commit the staged changes, or write the message first',
  },
  { name: 'quit', insert: 'q', usage: ':q', label: 'Hide the bottom panel, or close the diff tab' },
  { name: 'Git', insert: 'Git ', usage: ':Git args, :G args', label: 'Run git in a terminal' },
  { name: '!', insert: '!', usage: ':!command', label: 'Run a shell command in a terminal' },
  { name: 'terminal', insert: 'term', usage: ':term', label: 'Open a terminal' },
  { name: 'edit', insert: 'e ', usage: ':e path', label: 'Open a file' },
  { name: 'set', insert: 'set ', usage: ':set option', label: 'split, unified, wrap or nowrap' },
  { name: 'tabnext', insert: 'tabnext', usage: ':tabn', label: 'Next diff tab' },
  { name: 'tabprevious', insert: 'tabprevious', usage: ':tabp', label: 'Previous diff tab' },
  { name: 'map', insert: 'map', usage: ':map, :help', label: 'Search the keymaps' },
]

export const EX_HELP: [string, string][] = EX_COMMANDS.map((command) => [command.usage, command.label])

const OPTIONS = [
  { name: 'split', label: 'Old and new side by side' },
  { name: 'unified', label: 'Old and new stacked' },
  { name: 'wrap', label: 'Wrap long lines' },
  { name: 'nowrap', label: 'Scroll long lines' },
]

// The wildmenu for the command line: commands by the start of their name, then :set's options.
export function completeEx(text: string): ExCommand[] {
  const set = /^set\s+(\S*)$/.exec(text)
  if (set) {
    return OPTIONS.filter((option) => option.name.startsWith(set[1] ?? '')).map((option) => ({
      name: option.name,
      insert: `set ${option.name}`,
      usage: `:set ${option.name}`,
      label: option.label,
    }))
  }
  if (/\s/.test(text) || text.startsWith('!')) return []
  return EX_COMMANDS.filter((command) => command.name.startsWith(text) || command.insert.startsWith(text))
}

export function parseEx(input: string): Ex {
  const text = input.trim()
  if (!text) return { kind: 'none' }
  if (text.startsWith('!')) return { kind: 'shell', command: text.slice(1).trim() }
  const [head = '', ...rest] = text.split(/\s+/)
  const tail = text.slice(head.length).trim()
  switch (head) {
    case 'w':
    case 'write':
      return { kind: 'write', message: tail }
    case 'q':
    case 'quit':
    case 'close':
      return { kind: 'quit' }
    case 'G':
    case 'Git':
      return { kind: 'shell', command: `git ${tail}`.trim() }
    case 'term':
    case 'terminal':
      return { kind: 'terminal' }
    case 'e':
    case 'edit':
      return rest.length ? { kind: 'edit', path: tail } : { kind: 'unknown', text }
    case 'set':
      return rest.length ? { kind: 'set', option: tail } : { kind: 'unknown', text }
    case 'map':
    case 'help':
    case 'h':
      return { kind: 'keymaps' }
    case 'tabn':
    case 'tabnext':
      return { kind: 'tab', step: 1 }
    case 'tabp':
    case 'tabprevious':
      return { kind: 'tab', step: -1 }
    default:
      return { kind: 'unknown', text }
  }
}
