import {
  Button,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Kbd,
} from '@duck-diff/ui'
import { Pencil } from 'lucide-react'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import type { Overrides } from './bindings'
import { COMMANDS } from './commands'
import { EX_COMMANDS } from './ex'
import type { KeyState } from './state'

const selectOpen = (state: KeyState) => state.picker
const selectOverrides = (state: Overrides) => state
const GROUPS = [...new Set(COMMANDS.map((spec) => spec.group))]

// Telescope's keymaps picker: every command with its keys, searched by name, group or key, run on Enter.
export function KeymapsPicker({ run, onEdit }: { run(id: string): void; onEdit(): void }) {
  const { keys, keyOverrides } = useApp()
  const open = useStore(keys, selectOpen)
  const overrides = useStore(keyOverrides, selectOverrides)
  const setOpen = (next: boolean) => keys.set((state) => ({ ...state, picker: next }))
  const choose = (id: string) => {
    setOpen(false)
    // After the dialog has handed focus back, so the command lands where the user was.
    requestAnimationFrame(() => run(id))
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Keymaps"
      description="Every command and its keys"
      contentClassName="h-[min(80vh,44rem)] w-[min(94vw,56rem)] max-w-none lg:w-[min(94vw,56rem)]">
      <CommandInput placeholder="Search keymaps by name, group or key, like <leader>g or stage" />
      {/* CommandList wraps itself in a scroll area; that wrapper is what has to fill the dialog. */}
      <div className="flex min-h-0 flex-1 [&>[data-slot=scroll-area]]:min-w-0 [&>[data-slot=scroll-area]]:flex-1">
        <CommandList className="max-h-none min-w-0 flex-1 overflow-y-auto">
          <CommandEmpty>No keymap matches.</CommandEmpty>
          {GROUPS.map((group) => (
            <CommandGroup key={group} heading={group}>
              {COMMANDS.filter((spec) => spec.group === group).map((spec) => {
                const bound = overrides[spec.id] ?? spec.keys
                return (
                  <CommandItem
                    key={spec.id}
                    value={`${spec.title} ${group} ${bound.join(' ')} ${spec.id}`}
                    onSelect={() => choose(spec.id)}>
                    <span className="min-w-0 flex-1 truncate pe-0.5">{spec.title}</span>
                    <span className="flex shrink-0 gap-1">
                      {bound.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ))}
          <CommandGroup heading="Command line">
            {EX_COMMANDS.map((command) => (
              <CommandItem
                key={command.usage}
                value={`${command.usage} ${command.label} command line`}
                onSelect={() => {
                  setOpen(false)
                  keys.set((state) => ({ ...state, commandLine: true }))
                }}>
                <span className="min-w-0 flex-1 truncate pe-0.5">{command.label}</span>
                <Kbd>{command.usage}</Kbd>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-border border-t px-3 py-1.5 text-muted-foreground">
        <span>Enter runs the command. Space is the leader.</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setOpen(false)
            onEdit()
          }}>
          <Pencil />
          Change keys
        </Button>
      </footer>
    </CommandDialog>
  )
}
