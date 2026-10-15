import { Textarea } from '@duck-diff/ui'
import {
  AtSign,
  Bold,
  CircleDot,
  Code,
  FileType2,
  GitPullRequest,
  Hash,
  Heading,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Paperclip,
  TextQuote,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { fitRows } from '../lib/fit-rows'
import { Avatar } from './Conversation'
import { applyFormat, type Format } from './markdown-format'

const MAX_ATTACH = 512 * 1024

const TOOLS: ({ label: string; tip: string; icon: typeof Heading; format: Format } | '|')[] = [
  { label: 'Add a heading', tip: 'Heading', icon: Heading, format: 'heading' },
  { label: 'Add bold text', tip: 'Bold (Ctrl B)', icon: Bold, format: 'bold' },
  { label: 'Add italic text', tip: 'Italic (Ctrl I)', icon: Italic, format: 'italic' },
  '|',
  { label: 'Add a quote', tip: 'Quote', icon: TextQuote, format: 'quote' },
  { label: 'Add code', tip: 'Code (Ctrl E)', icon: Code, format: 'code' },
  { label: 'Add a link', tip: 'Link (Ctrl K)', icon: Link, format: 'link' },
  '|',
  { label: 'Add a numbered list', tip: 'Numbered list', icon: ListOrdered, format: 'ordered' },
  { label: 'Add a bulleted list', tip: 'Bulleted list', icon: List, format: 'bulleted' },
  { label: 'Add a task list', tip: 'Task list', icon: ListTodo, format: 'task' },
]
const SHORTCUTS: Record<string, Format> = { b: 'bold', i: 'italic', e: 'code', k: 'link' }

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
  placeholder = 'Leave a comment. Markdown, @people and #references work.',
}: {
  label: string
  value: string
  onChange(next: string): void
  // Ctrl or Cmd with Enter.
  onSubmit?(): void
  rows?: number
  autoFocus?: boolean
  placeholder?: string
}) {
  const { api } = useApp()
  const area = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
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

  // GitHub's API has no upload for attachments (github.com uses the browser session), so text files
  // go in as code blocks and anything else is refused with that reason.
  const attach = async (files: File[]) => {
    const blocks: string[] = []
    for (const file of files) {
      const text = file.size <= MAX_ATTACH ? await file.text() : null
      if (text === null || text.includes('\u0000')) {
        toast.error(`${file.name}: GitHub only takes images and binaries through github.com; text files work here`)
        continue
      }
      const fence = text.includes('```') ? '~~~' : '```'
      const lang = file.name.includes('.') ? (file.name.split('.').pop() ?? '') : ''
      blocks.push(
        `<details><summary>${file.name}</summary>\n\n${fence}${lang}\n${text.replace(/\n$/, '')}\n${fence}\n</details>`,
      )
    }
    if (!blocks.length) return
    const at = area.current?.selectionStart ?? value.length
    const insert = `${at && !value.slice(0, at).endsWith('\n') ? '\n' : ''}${blocks.join('\n\n')}\n`
    onChange(value.slice(0, at) + insert + value.slice(at))
  }

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

  const format = (kind: Format) => {
    const element = area.current
    if (!element) return
    const edit = applyFormat(value, element.selectionStart, element.selectionEnd, kind)
    onChange(edit.value)
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(edit.start, edit.end)
      setCaret(edit.end)
    })
  }
  const insert = (text: string) => {
    const element = area.current
    const at = element?.selectionStart ?? value.length
    const lead = at && !/\s$/.test(value.slice(0, at)) ? ' ' : ''
    onChange(`${value.slice(0, at)}${lead}${text}${value.slice(at)}`)
    requestAnimationFrame(() => {
      element?.focus()
      const end = at + lead.length + text.length
      element?.setSelectionRange(end, end)
      setCaret(end)
      setDismissed(false)
    })
  }

  return (
    <div className="flex flex-col rounded-md border border-border bg-card">
      <div className="flex items-end gap-1 border-border border-b px-2 pt-2">
        <div role="tablist" aria-label="Comment mode" className="flex">
          {(['write', 'preview'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={tab === mode}
              onClick={() => setTab(mode)}
              className="-mb-px cursor-pointer rounded-t-md border border-transparent px-3 py-1.5 text-muted-foreground hover:text-foreground aria-selected:border-border aria-selected:border-b-background aria-selected:bg-background aria-selected:text-foreground">
              {mode === 'write' ? 'Write' : 'Preview'}
            </button>
          ))}
        </div>
        {tab === 'write' ? (
          <div className="ms-auto flex flex-wrap items-center pb-1">
            {TOOLS.map((tool, index) =>
              tool === '|' ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: the toolbar never reorders
                <span key={`gap-${index}`} className="mx-1 h-4 w-px bg-border" />
              ) : (
                <IconTool key={tool.label} label={tool.label} tip={tool.tip} onClick={() => format(tool.format)}>
                  <tool.icon />
                </IconTool>
              ),
            )}
            <span className="mx-1 h-4 w-px bg-border" />
            <IconTool label="Mention someone" tip="Mention (@)" onClick={() => insert('@')}>
              <AtSign />
            </IconTool>
            <IconTool label="Reference an issue or pull request" tip="Reference (#)" onClick={() => insert('#')}>
              <Hash />
            </IconTool>
            <IconTool label="Attach files" tip="Attach files" onClick={() => picker.current?.click()}>
              <Paperclip />
            </IconTool>
          </div>
        ) : null}
      </div>
      {tab === 'write' ? (
        <div className="relative p-2">
          <Textarea
            ref={area}
            aria-label={label}
            placeholder={placeholder}
            rows={fitRows(value, rows)}
            autoFocus={autoFocus}
            value={value}
            onChange={(event) => {
              onChange(event.target.value)
              setCaret(event.target.selectionStart)
              setDismissed(false)
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('Files')) event.preventDefault()
            }}
            onDrop={(event) => {
              if (!event.dataTransfer.files.length) return
              event.preventDefault()
              void attach([...event.dataTransfer.files])
            }}
            onPaste={(event) => {
              if (!event.clipboardData.files.length) return
              event.preventDefault()
              void attach([...event.clipboardData.files])
            }}
            onKeyDown={(event) => {
              const shortcut =
                (event.ctrlKey || event.metaKey) && !event.shiftKey ? SHORTCUTS[event.key.toLowerCase()] : undefined
              if (shortcut) {
                event.preventDefault()
                event.stopPropagation()
                return format(shortcut)
              }
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
        <div className="m-2 min-h-24 rounded-md border border-border p-3">
          {value.trim() ? (
            <Suspense fallback={<p className="whitespace-pre-wrap">{value}</p>}>
              <Markdown text={value} />
            </Suspense>
          ) : (
            <p className="text-muted-foreground">Nothing to preview.</p>
          )}
        </div>
      )}
      <div className="flex items-center gap-3 border-border border-t px-3 py-1.5 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <FileType2 className="size-4" />
          Markdown is supported
        </span>
        <span className="h-4 w-px bg-border" />
        <button
          type="button"
          onClick={() => picker.current?.click()}
          className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
          <ImagePlus className="size-4" />
          Paste, drop, or click to add files
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files?.length) void attach([...event.target.files])
            event.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
