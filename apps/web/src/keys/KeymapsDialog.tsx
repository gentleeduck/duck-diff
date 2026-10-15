import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Kbd } from '@duck-diff/ui'
import { Pencil, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import { conflicts, type Overrides } from './bindings'
import { COMMANDS, type CommandSpec } from './commands'
import { parseKeys } from './engine'
import { EX_HELP } from './ex'

const selectOverrides = (state: Overrides) => state
const GROUPS = [...new Set(COMMANDS.map((spec) => spec.group))]

function valid(notation: string): boolean {
  try {
    return parseKeys(notation).length > 0
  } catch {
    return false
  }
}

function Row({
  spec,
  keys,
  edited,
  onSave,
}: {
  spec: CommandSpec
  keys: string[]
  edited: boolean
  onSave(keys: string[] | null): void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const entries = (draft ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const bad = entries.filter((entry) => !valid(entry))
  return (
    <li className="flex min-h-8 items-center gap-3 py-0.5">
      <span className="min-w-0 flex-1 truncate pe-0.5">{spec.title}</span>
      {draft === null ? (
        <>
          <span className="flex flex-wrap justify-end gap-1">
            {keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </span>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Change keys for ${spec.title}`}
            onClick={() => setDraft(keys.join(', '))}>
            <Pencil />
          </Button>
          {edited ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Default keys for ${spec.title}`}
              onClick={() => onSave(null)}>
              <RotateCcw />
            </Button>
          ) : null}
        </>
      ) : (
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            if (bad.length || !entries.length) return
            onSave(entries)
            setDraft(null)
          }}>
          <Input
            autoFocus
            aria-label={`Keys for ${spec.title}`}
            aria-invalid={bad.length > 0}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              setDraft(null)
            }}
            className="h-7 w-56"
            placeholder="<leader>gs, ]c"
          />
          <Button size="sm" type="submit" disabled={bad.length > 0 || !entries.length}>
            Save
          </Button>
        </form>
      )}
    </li>
  )
}

// Every keyed command, from the same list the keys run from, with the user's own bindings.
export function KeymapsDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { keyOverrides } = useApp()
  const overrides = useStore(keyOverrides, selectOverrides)
  const [filter, setFilter] = useState('')
  const clashes = useMemo(() => conflicts(COMMANDS, overrides), [overrides])
  const term = filter.trim().toLowerCase()
  const titles = new Map(COMMANDS.map((spec) => [spec.id, spec.title]))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(94vw,56rem)] max-w-none flex-col gap-3">
        <DialogTitle>Keymaps</DialogTitle>
        <DialogDescription>
          Space is the leader. Keys use Neovim notation; separate several with commas.
        </DialogDescription>
        <Input
          aria-label="Filter keymaps"
          placeholder="Filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        {clashes.length ? (
          <p role="alert" className="text-tn-yellow">
            {clashes
              .map((clash) => `${clash.keys} runs ${clash.commands.map((id) => titles.get(id)).join(' and ')}`)
              .join('; ')}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto pe-1">
          {GROUPS.map((group) => {
            const specs = COMMANDS.filter(
              (spec) =>
                spec.group === group &&
                (!term || `${spec.title} ${(overrides[spec.id] ?? spec.keys).join(' ')}`.toLowerCase().includes(term)),
            )
            if (!specs.length) return null
            return (
              <section key={group} aria-label={group} className="mb-3">
                <h3 className="mb-1 text-tn-magenta">{group}</h3>
                <ul>
                  {specs.map((spec) => (
                    <Row
                      key={spec.id}
                      spec={spec}
                      keys={overrides[spec.id] ?? spec.keys}
                      edited={Boolean(overrides[spec.id])}
                      onSave={(keys) => keyOverrides.bind(spec.id, keys)}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
          {!term || 'command line'.includes(term) ? (
            <section aria-label="Command line" className="mb-3">
              <h3 className="mb-1 text-tn-magenta">Command line</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {EX_HELP.map(([command, label]) => (
                  <div key={command} className="contents">
                    <dt>
                      <Kbd>{command}</Kbd>
                    </dt>
                    <dd className="text-muted-foreground">{label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
