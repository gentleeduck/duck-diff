import { Input } from '@duck-diff/ui'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { openFile } from '../files/open-file'
import { useGit } from '../git/GitProvider'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { useStore } from '../lib/store'
import { ROOT } from '../state/tabs'
import { focusTerminal } from '../terminal/input'
import { parseEx } from './ex'
import type { KeyState } from './state'

const selectOpen = (state: KeyState) => state.commandLine
const HISTORY_KEY = 'duck-diff:ex-history'

function readHistory(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown
    return Array.isArray(saved) ? saved.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

// Vim's command line along the bottom: :w commits, :Git and :! run in a terminal, Up and Down walk history.
export function CommandLine({ onKeymaps }: { onKeymaps(): void }) {
  const app = useApp()
  const { keys, panel, terminalTabs, tabs, settings } = app
  const open = useStore(keys, selectOpen)
  const git = useGit()
  const { navigate } = useTarget()
  const { show } = useView()
  const [text, setText] = useState('')
  const history = useRef<string[]>([])
  // Where Up and Down are in the history; -1 until they are used.
  const at = useRef(-1)

  if (!open) return null
  const close = () => {
    setText('')
    at.current = -1
    keys.set((state) => ({ ...state, commandLine: false }))
  }
  const execute = () => {
    const command = parseEx(text)
    if (text.trim()) {
      const next = [...readHistory().filter((entry) => entry !== text.trim()), text.trim()].slice(-50)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {}
    }
    close()
    switch (command.kind) {
      case 'write':
        if (command.message) void git.run('commit', { message: command.message, amend: false }, 'Committed')
        else {
          show('changes')
          requestAnimationFrame(() =>
            document.querySelector<HTMLElement>('form[aria-label="Commit"] textarea')?.focus(),
          )
        }
        return
      case 'quit': {
        const { active } = tabs.get()
        if (panel.get().open) return panel.toggle()
        if (active === ROOT) return
        const next = tabs.close(active)
        if (next) navigate(next.target, true)
        return
      }
      case 'shell': {
        const key = terminalTabs.run(command.command)
        panel.show(key)
        focusTerminal(key)
        return
      }
      case 'terminal': {
        const key = terminalTabs.add().key
        panel.show(key)
        focusTerminal(key)
        return
      }
      case 'edit':
        openFile(app, command.path)
        show('files')
        return
      case 'set': {
        const option = command.option
        if (option === 'split' || option === 'unified') settings.set((prev) => ({ ...prev, diffStyle: option }))
        else if (option === 'wrap' || option === 'nowrap')
          settings.set((prev) => ({ ...prev, overflow: option === 'wrap' ? 'wrap' : 'scroll' }))
        else toast.error(`Unknown option: ${option}`)
        return
      }
      case 'keymaps':
        return onKeymaps()
      case 'tab': {
        const { tabs: list, active } = tabs.get()
        const index = list.findIndex((tab) => tab.id === active)
        const next = list[(index + command.step + list.length) % list.length]
        if (next) navigate(next.target)
        return
      }
      case 'unknown':
        toast.error(`Not an editor command: ${command.text}`)
        return
      case 'none':
        return
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex h-7 items-center gap-1 border-border border-t bg-card px-3">
      <span className="text-tn-blue">:</span>
      <Input
        autoFocus
        aria-label="Command line"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={close}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            execute()
          } else if (event.key === 'Escape' || (event.key === 'Backspace' && !text)) {
            event.preventDefault()
            close()
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            if (at.current === -1) {
              history.current = readHistory()
              at.current = history.current.length
            }
            at.current = Math.max(0, Math.min(history.current.length, at.current + (event.key === 'ArrowUp' ? -1 : 1)))
            setText(history.current[at.current] ?? '')
          }
        }}
        className="h-6 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
      />
    </div>
  )
}
