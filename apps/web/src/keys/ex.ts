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

export const EX_HELP: [string, string][] = [
  [':w [message]', 'Commit the staged changes, or write the message first'],
  [':q', 'Close the diff tab, or hide the bottom panel'],
  [':Git args, :G args', 'Run git in a terminal'],
  [':!command', 'Run a shell command in a terminal'],
  [':term', 'Open a terminal'],
  [':e path', 'Open a file'],
  [':set split, :set unified', 'Diff layout'],
  [':tabn, :tabp', 'Next or previous diff tab'],
  [':map, :help', 'Keymaps'],
]

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
