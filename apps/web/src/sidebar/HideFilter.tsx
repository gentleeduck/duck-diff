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

let counter = 0
const newId = () => `hide-${Date.now().toString(36)}-${(counter++).toString(36)}`

interface Draft {
  label: string
  pattern: string
}

// A name and a regex, for adding a pattern and for editing one; the name falls back to the regex.
function PatternForm({
  initial,
  submit,
  onSubmit,
  onCancel,
  names,
}: {
  initial: Draft
  submit: 'add' | 'keep'
  onSubmit(draft: Draft): void
  onCancel?(): void
  names: { label: string; pattern: string }
}) {
  const [draft, setDraft] = useState(initial)
  const ok = validPattern(draft.pattern)
  const cancelOnEscape = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape' || !onCancel) return
    // Escape leaves the edit, not the whole popover.
    event.preventDefault()
    event.stopPropagation()
    onCancel()
  }
  return (
    <form
      className="flex min-w-0 flex-1 flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ok) return
        onSubmit({ label: draft.label.trim() || draft.pattern, pattern: draft.pattern })
        if (submit === 'add') setDraft({ label: '', pattern: '' })
      }}>
      <div className="flex items-center gap-1">
        <Input
          autoFocus={submit === 'keep'}
          aria-label={names.label}
          placeholder="Name, like Translations"
          value={draft.label}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          onKeyDown={cancelOnEscape}
          className="h-7 min-w-0 flex-1"
        />
        {submit === 'keep' ? (
          <>
            <Button type="submit" size="icon" variant="ghost" aria-label="Keep the pattern" disabled={!ok}>
              <Check />
            </Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Drop the edit" onClick={onCancel}>
              <X />
            </Button>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Input
          aria-label={names.pattern}
          aria-invalid={draft.pattern.length > 0 && !ok}
          placeholder="A regex, like \.snap$ or ^docs/"
          value={draft.pattern}
          onChange={(event) => setDraft({ ...draft, pattern: event.target.value })}
          onKeyDown={cancelOnEscape}
          className="h-7 min-w-0 flex-1 font-mono"
        />
        {submit === 'add' ? (
          <Button type="submit" size="sm" disabled={!ok}>
            <Plus />
            Add
          </Button>
        ) : null}
      </div>
      {draft.pattern && !ok ? <p className="text-tn-red">That is not a valid regular expression.</p> : null}
    </form>
  )
}

// Paths left out of the tree and the diff, by regular expression; tests are the first, built-in entry.
export function HideFilter({ hiddenCount }: { hiddenCount: number }) {
  const { settings } = useApp()
  const patterns = useSettings(selectPatterns)
  const [editing, setEditing] = useState<string | null>(null)
  const on = patterns.filter((entry) => entry.enabled).length
  const save = (next: HidePattern[]) => settings.set((prev) => ({ ...prev, hidePatterns: next }))
  const update = (id: string, change: Partial<HidePattern>) =>
    save(patterns.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)))

  return (
    <Popover onOpenChange={() => setEditing(null)}>
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
      <PopoverContent align="end" className="flex w-[28rem] flex-col gap-3">
        <div className="flex items-center justify-between">
          <span>Hide files</span>
          {hiddenCount ? (
            <Badge variant="outline" size="sm">
              {hiddenCount} hidden
            </Badge>
          ) : null}
        </div>
        <ul aria-label="Hide patterns" className="flex flex-col gap-2">
          {patterns.map((entry) => (
            <li key={entry.id} className="flex items-start gap-2">
              <Switch
                className="mt-1 border-muted-foreground"
                aria-label={`Hide ${entry.label}`}
                checked={entry.enabled}
                onCheckedChange={(enabled: boolean) => update(entry.id, { enabled })}
              />
              {editing === entry.id ? (
                <PatternForm
                  initial={{ label: entry.label === entry.pattern ? '' : entry.label, pattern: entry.pattern }}
                  submit="keep"
                  names={{ label: `Name for ${entry.label}`, pattern: `Pattern for ${entry.label}` }}
                  onSubmit={(draft) => {
                    update(entry.id, draft)
                    setEditing(null)
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate pe-0.5">{entry.label}</span>
                    <code className="block truncate text-muted-foreground" title={entry.pattern}>
                      {entry.pattern}
                    </code>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${entry.label}`}
                    onClick={() => setEditing(entry.id)}>
                    <Pencil />
                  </Button>
                  {/* The tests entry can be changed and switched off, but stays. */}
                  {entry.id === 'tests' ? (
                    <span className="size-7 shrink-0" />
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${entry.label}`}
                      onClick={() => save(patterns.filter((other) => other.id !== entry.id))}>
                      <X />
                    </Button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="border-border border-t pt-3">
          <PatternForm
            initial={{ label: '', pattern: '' }}
            submit="add"
            names={{ label: 'New pattern name', pattern: 'New hide pattern' }}
            onSubmit={(draft) => save([...patterns, { id: newId(), ...draft, enabled: true }])}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
