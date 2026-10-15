import { Input, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import { Check, Settings } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { IconTool } from '../app/IconTool'

export interface Choice {
  value: string
  label: string
  detail?: string
  icon?: ReactNode
}

// GitHub's sidebar picker: tick what applies, and the change is sent once the picker closes.
export function Picker({
  title,
  load,
  selected,
  single = false,
  onApply,
}: {
  title: string
  load(): Promise<Choice[]>
  selected: string[]
  single?: boolean
  onApply(next: string[]): void
}) {
  const [open, setOpen] = useState(false)
  const [choices, setChoices] = useState<Choice[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set(selected))
  const [filter, setFilter] = useState('')

  const toggleOpen = (next: boolean) => {
    setOpen(next)
    if (next) {
      setPicked(new Set(selected))
      setFilter('')
      load().then(setChoices, () => setChoices([]))
      return
    }
    const before = [...selected].sort().join('\n')
    const after = [...picked].sort().join('\n')
    if (before !== after) onApply([...picked])
  }

  const toggle = (value: string) => {
    if (single) {
      setPicked(picked.has(value) ? new Set() : new Set([value]))
      return
    }
    const next = new Set(picked)
    if (!next.delete(value)) next.add(value)
    setPicked(next)
  }

  const needle = filter.trim().toLowerCase()
  const shown = (choices ?? []).filter((choice) => !needle || choice.label.toLowerCase().includes(needle))
  return (
    <Popover open={open} onOpenChange={toggleOpen}>
      <PopoverTrigger asChild>
        <span>
          <IconTool label={`Edit ${title.toLowerCase()}`} onClick={() => {}}>
            <Settings />
          </IconTool>
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-1 p-1">
        <p className="px-2 pt-1 text-muted-foreground">{title}</p>
        <Input
          autoFocus
          aria-label={`Filter ${title.toLowerCase()}`}
          placeholder="Filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <div role="listbox" aria-label={title} aria-multiselectable={!single} className="max-h-72 overflow-y-auto">
          {choices === null ? <p className="p-2 text-muted-foreground">Reading...</p> : null}
          {choices?.length === 0 ? <p className="p-2 text-muted-foreground">Nothing to pick.</p> : null}
          {shown.map((choice) => (
            <div
              key={choice.value}
              role="option"
              tabIndex={0}
              aria-selected={picked.has(choice.value)}
              onClick={() => toggle(choice.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  toggle(choice.value)
                }
              }}
              className="flex min-h-7 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent">
              <span className="w-4 shrink-0">{picked.has(choice.value) ? <Check className="size-4" /> : null}</span>
              {choice.icon}
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-foreground">{choice.label}</span>
                {choice.detail ? <span className="truncate text-muted-foreground">{choice.detail}</span> : null}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
