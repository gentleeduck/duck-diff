import { Tabs, TabsList, TabsTrigger, Textarea } from '@duck-diff/ui'
import { CircleDot, GitPullRequest } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { Avatar } from './Conversation'

const Markdown = lazy(() => import('../markdown/Markdown').then((module) => ({ default: module.Markdown })))

interface Suggestion {
  key: string
  insert: string
  label: string
  detail: string
  icon: React.ReactNode
}

// The word being typed right before the caret, when it starts with @ or #.
function trigger(text: string, caret: number): { sign: '@' | '#'; word: string; start: number } | null {
  const match = /(^|\s)([@#])([\w.-]*)$/.exec(text.slice(0, caret))
  if (!match) return null
  return { sign: match[2] as '@' | '#', word: match[3] ?? '', start: caret - (match[3]?.length ?? 0) - 1 }
}

// GitHub's comment box: write or preview, with @people and #issue suggestions as you type.
export function MarkdownEditor({
  label,
  value,
  onChange,
  onSubmit,
  rows = 4,
  autoFocus,
}: {
  label: string
  value: string
  onChange(next: string): void
  // Ctrl or Cmd with Enter.
  onSubmit?(): void
  rows?: number
  autoFocus?: boolean
}) {
  const { api } = useApp()
  const area = useRef<HTMLTextAreaElement>(null)
  const [tab, setTab] = useState('write')
  const [caret, setCaret] = useState(0)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const typing = trigger(value, caret)
  const sign = typing?.sign ?? null
  const typed = typing?.word ?? ''

  useEffect(() => {
    setActive(0)
    if (!sign || dismissed) return setSuggestions([])
    let alive = true
    const word = typed.toLowerCase()
    if (sign === '@') {
      api.github.mentions().then(
        (users) =>
          alive &&
          setSuggestions(
            users
              .filter((user) => user.login.toLowerCase().startsWith(word))
              .slice(0, 8)
              .map((user) => ({
                key: user.login,
                insert: `@${user.login} `,
                label: user.login,
                detail: '',
                icon: <Avatar user={user} />,
              })),
          ),
        () => {},
      )
    } else {
      // Searching waits for a pause, as GitHub limits search calls.
      const timer = setTimeout(() => {
        api.github.references(/^\d+$/.test(word) ? word : `${word} in:title`).then(
          (found) =>
            alive &&
            setSuggestions(
              found.map((item) => ({
                key: String(item.number),
                insert: `#${item.number} `,
                label: `#${item.number}`,
                detail: item.title,
                icon: item.pull ? (
                  <GitPullRequest className="size-4 text-added" />
                ) : (
                  <CircleDot className="size-4 text-added" />
                ),
              })),
            ),
          () => {},
        )
      }, 250)
      return () => {
        alive = false
        clearTimeout(timer)
      }
    }
    return () => {
      alive = false
    }
  }, [api, sign, typed, dismissed])

  const accept = (suggestion: Suggestion) => {
    if (!typing) return
    const next = value.slice(0, typing.start) + suggestion.insert + value.slice(caret)
    const at = typing.start + suggestion.insert.length
    onChange(next)
    setSuggestions([])
    requestAnimationFrame(() => {
      area.current?.focus()
      area.current?.setSelectionRange(at, at)
      setCaret(at)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Tabs value={tab} onValueChange={(next) => next !== tab && setTab(next)}>
        <TabsList className="h-8">
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'write' ? (
        <div className="relative">
          <Textarea
            ref={area}
            aria-label={label}
            placeholder="Leave a comment. Markdown, @people and #references work."
            rows={rows}
            autoFocus={autoFocus}
            value={value}
            onChange={(event) => {
              onChange(event.target.value)
              setCaret(event.target.selectionStart)
              setDismissed(false)
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onKeyDown={(event) => {
              if (suggestions.length) {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  const step = event.key === 'ArrowDown' ? 1 : -1
                  setActive((at) => (at + step + suggestions.length) % suggestions.length)
                  return
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  event.preventDefault()
                  const chosen = suggestions[active]
                  if (chosen) accept(chosen)
                  return
                }
                if (event.key === 'Escape') {
                  setDismissed(true)
                  return
                }
              }
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) onSubmit?.()
            }}
          />
          {suggestions.length ? (
            <div
              role="listbox"
              aria-label="Suggestions"
              className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
              {suggestions.map((suggestion, i) => (
                <div
                  key={suggestion.key}
                  role="option"
                  tabIndex={-1}
                  aria-selected={i === active}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    accept(suggestion)
                  }}
                  className="flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 aria-selected:bg-accent">
                  {suggestion.icon}
                  <span className="shrink-0 text-foreground">{suggestion.label}</span>
                  <span className="min-w-0 truncate text-muted-foreground">{suggestion.detail}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="min-h-24 rounded-md border border-border p-3">
          {value.trim() ? (
            <Suspense fallback={<p className="whitespace-pre-wrap">{value}</p>}>
              <Markdown text={value} />
            </Suspense>
          ) : (
            <p className="text-muted-foreground">Nothing to preview.</p>
          )}
        </div>
      )}
    </div>
  )
}
