import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@duck-diff/ui'
import { Check, ListFilter, Pencil, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useSettings } from '../hooks/useSettings'
import { type HidePattern, validPattern } from '../lib/hide'
import type { Settings } from '../state/settings'

const selectPatterns = (state: Settings) => state.hidePatterns

// One pattern the user added: shown as its text, edited in place, Enter to keep and Escape to drop the edit.
function PatternText({ entry, onSave }: { entry: HidePattern; onSave(pattern: string): void }) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) {
    return (
      <>
        <code className="min-w-0 flex-1 truncate pe-0.5" title={entry.pattern}>
          {entry.pattern}
        </code>
        <Button size="icon" variant="ghost" aria-label={`Edit ${entry.label}`} onClick={() => setDraft(entry.pattern)}>
          <Pencil />
        </Button>
      </>
    )
  }
  const ok = validPattern(draft)
  const keep = () => {
    if (!ok) return
    onSave(draft)
    setDraft(null)
  }
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        keep()
      }}>
      <Input
        autoFocus
        aria-label={`Pattern for ${entry.label}`}
        aria-invalid={!ok}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          // Escape leaves the edit, not the whole popover.
          event.preventDefault()
          event.stopPropagation()
          setDraft(null)
        }}
        className="h-7 min-w-0 flex-1"
      />
      <Button type="submit" size="icon" variant="ghost" aria-label="Keep the pattern" disabled={!ok}>
        <Check />
      </Button>
    </form>
  )
}

let counter = 0
const newId = () => `hide-${Date.now().toString(36)}-${(counter++).toString(36)}`

// Paths left out of the tree and the diff, by regular expression; tests are the first, built-in entry.
export function HideFilter({ hiddenCount }: { hiddenCount: number }) {
  const { settings } = useApp()
  const patterns = useSettings(selectPatterns)
  const [draft, setDraft] = useState('')
  const on = patterns.filter((entry) => entry.enabled).length
  const save = (next: HidePattern[]) => settings.set((prev) => ({ ...prev, hidePatterns: next }))
  const update = (id: string, change: Partial<HidePattern>) =>
    save(patterns.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)))
  const ok = validPattern(draft)
  const add = () => {
    if (!ok) return
    save([...patterns, { id: newId(), label: draft, pattern: draft, enabled: true }])
    setDraft('')
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              aria-label="Hide files"
              className={`relative shrink-0 ${on ? 'border-tn-yellow/60 text-tn-yellow' : ''}`}>
              <ListFilter />
              {on ? (
                <span className="absolute -end-1.5 -top-1.5 rounded-full bg-tn-yellow px-1 text-[0.7em] text-background leading-[1.4]">
                  {on}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{on ? `Hiding ${hiddenCount} files` : 'Hide files by pattern'}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="flex w-[26rem] flex-col gap-3">
        <div className="flex items-center justify-between">
          <span>Hide files</span>
          {hiddenCount ? (
            <Badge variant="outline" size="sm">
              {hiddenCount} hidden
            </Badge>
          ) : null}
        </div>
        <ul aria-label="Hide patterns" className="flex flex-col gap-1">
          {patterns.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2">
              <Switch
                className="border-muted-foreground"
                aria-label={`Hide ${entry.label}`}
                checked={entry.enabled}
                onCheckedChange={(enabled: boolean) => update(entry.id, { enabled })}
              />
              {entry.id === 'tests' ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate pe-0.5">{entry.label}</span>
                  <code className="block truncate text-muted-foreground" title={entry.pattern}>
                    {entry.pattern}
                  </code>
                </span>
              ) : (
                <PatternText entry={entry} onSave={(pattern) => update(entry.id, { pattern, label: pattern })} />
              )}
              {entry.id === 'tests' ? null : (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${entry.label}`}
                  onClick={() => save(patterns.filter((other) => other.id !== entry.id))}>
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            add()
          }}>
          <Input
            aria-label="New hide pattern"
            aria-invalid={draft.length > 0 && !ok}
            placeholder="A regex, like \.snap$ or ^docs/"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={!ok}>
            <Plus />
            Add
          </Button>
        </form>
        {draft && !ok ? <p className="text-tn-red">That is not a valid regular expression.</p> : null}
      </PopoverContent>
    </Popover>
  )
}
