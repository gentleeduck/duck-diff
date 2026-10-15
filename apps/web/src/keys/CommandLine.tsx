import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { openFile } from '../files/open-file'
import { useGit } from '../git/GitProvider'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { saved as storage } from '../lib/saved'
import { ROOT } from '../state/tabs'
import { focusTerminal } from '../terminal/input'
import { completeEx, parseEx } from './ex'

const HISTORY_KEY = 'duck-diff:ex-history'

function readHistory(): string[] {
  try {
    const saved = JSON.parse(storage.getItem(HISTORY_KEY) ?? '[]') as unknown
    return Array.isArray(saved) ? saved.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

// Neovim's command line, in the status bar: Tab and Shift Tab walk the matches shown above it (as the
// wildmenu does), Up and Down walk history, Enter runs, Escape leaves.
export function CommandLine() {
  const app = useApp()
  const { keys, panel, terminalTabs, tabs, settings } = app
  const git = useGit()
  const { navigate } = useTarget()
  const { show } = useView()
  const [text, setText] = useState('')
  // What was typed before Tab started filling in matches, so the list stays put while it is walked.
  const [typed, setTyped] = useState('')
  const [chosen, setChosen] = useState(-1)
  const history = useRef<string[]>([])
  const at = useRef(-1)
  const matches = useMemo(() => completeEx(typed), [typed])
  // Where the cursor was, to go back to when the line is left without running anything, as in Neovim.
  const [previous] = useState(() => document.activeElement as HTMLElement | null)

  const type = (next: string) => {
    setText(next)
    setTyped(next)
    setChosen(-1)
  }
  const close = () => keys.set((state) => ({ ...state, commandLine: false }))
  const walk = (by: 1 | -1) => {
    if (!matches.length) return
    const next = (chosen + by + matches.length + (chosen === -1 && by === -1 ? 1 : 0)) % matches.length
    setChosen(next)
    setText(matches[next]?.insert ?? text)
  }
  const execute = () => {
    const command = parseEx(text)
    if (text.trim()) {
      const saved = [...readHistory().filter((entry) => entry !== text.trim()), text.trim()].slice(-50)
      try {
        storage.setItem(HISTORY_KEY, JSON.stringify(saved))
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
        if (panel.get().open) return panel.toggle()
        const { active } = tabs.get()
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
        keys.set((state) => ({ ...state, picker: true }))
        return
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
    <div className="relative flex h-full min-w-0 flex-1 items-center gap-0.5">
      {matches.length ? (
        <ul
          aria-label="Matching commands"
          className="absolute bottom-full -start-3 z-50 mb-px w-[min(44rem,90vw)] overflow-hidden rounded-t-md border border-border border-b-0 bg-popover py-1 shadow-lg">
          {matches.map((match, index) => (
            <li
              key={match.usage}
              aria-current={index === chosen}
              className={`grid grid-cols-[12rem_minmax(0,1fr)] gap-3 px-3 py-0.5 ${
                index === chosen ? 'bg-accent text-foreground' : 'text-muted-foreground'
              }`}>
              <span className="truncate text-tn-blue">{match.usage}</span>
              <span className="truncate pe-0.5">{match.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <span className="text-tn-yellow">:</span>
      <input
        // biome-ignore lint/a11y/noAutofocus: the command line exists to be typed into
        autoFocus
        aria-label="Command line"
        spellCheck={false}
        autoComplete="off"
        value={text}
        onChange={(event) => type(event.target.value)}
        onBlur={close}
        onKeyDown={(event) => {
          const key = event.key
          if (key === 'Enter') {
            event.preventDefault()
            execute()
          } else if (key === 'Escape' || (event.ctrlKey && key === 'c') || (key === 'Backspace' && !text)) {
            event.preventDefault()
            close()
            requestAnimationFrame(() => previous?.focus?.())
          } else if (key === 'Tab' || (event.ctrlKey && (key === 'n' || key === 'p'))) {
            event.preventDefault()
            walk(event.shiftKey || key === 'p' ? -1 : 1)
          } else if (key === 'ArrowUp' || key === 'ArrowDown') {
            event.preventDefault()
            if (at.current === -1) {
              history.current = readHistory()
              at.current = history.current.length
            }
            at.current = Math.max(0, Math.min(history.current.length, at.current + (key === 'ArrowUp' ? -1 : 1)))
            type(history.current[at.current] ?? '')
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-foreground caret-tn-yellow outline-none"
      />
    </div>
  )
}
