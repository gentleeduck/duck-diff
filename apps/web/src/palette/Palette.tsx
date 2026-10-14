import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@duck-diff/ui'
import { useApp } from '../app/AppProvider'
import { presets } from '../compare/model'
import { useRefs } from '../hooks/useRefs'
import { useSession } from '../hooks/useSession'
import { useTarget } from '../hooks/useTarget'
import { itemId } from '../lib/items'
import type { SessionState } from '../state/session'
import type { Settings } from '../state/settings'
import { useWrites } from '../writes/WritesProvider'

const selectFiles = (state: SessionState) => state.files

type Toggle = { label: string; apply(prev: Settings): Settings }

const TOGGLES: Toggle[] = [
  { label: 'Split view', apply: (prev) => ({ ...prev, diffStyle: 'split' }) },
  { label: 'Stacked view', apply: (prev) => ({ ...prev, diffStyle: 'unified' }) },
  {
    label: 'Toggle line wrapping',
    apply: (prev) => ({ ...prev, overflow: prev.overflow === 'wrap' ? 'scroll' : 'wrap' }),
  },
  { label: 'Toggle line numbers', apply: (prev) => ({ ...prev, lineNumbers: !prev.lineNumbers }) },
  { label: 'Toggle line backgrounds', apply: (prev) => ({ ...prev, backgrounds: !prev.backgrounds }) },
  { label: 'Toggle unchanged lines', apply: (prev) => ({ ...prev, expandUnchanged: !prev.expandUnchanged }) },
  { label: 'Light theme', apply: (prev) => ({ ...prev, themeType: 'light' }) },
  { label: 'Dark theme', apply: (prev) => ({ ...prev, themeType: 'dark' }) },
  { label: 'System theme', apply: (prev) => ({ ...prev, themeType: 'system' }) },
]

export function Palette({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { settings, viewer } = useApp()
  const files = useSession(selectFiles)
  const { navigate } = useTarget()
  const refs = useRefs()
  const writes = useWrites()
  const branches = refs.refs.filter((ref) => ref.kind === 'branch').map((ref) => ref.name)
  const run = (action: () => void) => {
    onOpenChange(false)
    action()
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette">
      <CommandInput placeholder="Jump to a file, change the comparison or a setting" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="Files">
          {files.map((file) => (
            <CommandItem
              key={file.path}
              value={`file ${file.path}`}
              onSelect={() =>
                run(() => viewer.current?.scrollTo({ type: 'item', id: itemId(file.path), align: 'start' }))
              }>
              <span className="truncate font-mono">{file.path}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Compare">
          {presets(branches).map((preset) => (
            <CommandItem
              key={preset.label}
              value={`compare ${preset.label}`}
              onSelect={() => run(() => navigate(preset.target))}>
              {preset.label}
            </CommandItem>
          ))}
          {branches.map((name) => (
            <CommandItem
              key={name}
              value={`compare branch ${name}`}
              onSelect={() => run(() => navigate({ kind: 'range', from: name, to: 'HEAD', mode: 'merge-base' }))}>
              This branch against <span className="font-mono">{name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Changes">
          <CommandItem value="undo last discard" onSelect={() => run(() => void writes.undo())}>
            Undo last discard
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="View">
          {TOGGLES.map((toggle) => (
            <CommandItem
              key={toggle.label}
              value={`view ${toggle.label}`}
              onSelect={() => run(() => settings.set(toggle.apply))}>
              {toggle.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
