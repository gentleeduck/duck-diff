import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@duck-diff/ui'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { presets } from '../compare/model'
import { useGit } from '../git/GitProvider'
import { useRefs } from '../hooks/useRefs'
import { useSession } from '../hooks/useSession'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { itemId } from '../lib/items'
import type { View } from '../lib/view-url'
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
  { label: 'Toggle the left panel', apply: (prev) => ({ ...prev, sidebar: !prev.sidebar }) },
  { label: 'Show test files', apply: (prev) => ({ ...prev, tests: 'show' }) },
  { label: 'Fold test files', apply: (prev) => ({ ...prev, tests: 'fold' }) },
  { label: 'Hide test files', apply: (prev) => ({ ...prev, tests: 'hide' }) },
  { label: 'Light theme', apply: (prev) => ({ ...prev, themeType: 'light' }) },
  { label: 'Dark theme', apply: (prev) => ({ ...prev, themeType: 'dark' }) },
  { label: 'System theme', apply: (prev) => ({ ...prev, themeType: 'system' }) },
]

const VIEWS: { view: View; label: string }[] = [
  { view: 'changes', label: 'Changes' },
  { view: 'graph', label: 'Commit graph' },
  { view: 'files', label: 'Files' },
  { view: 'prs', label: 'Pull requests' },
  { view: 'issues', label: 'Issues' },
]

export function Palette({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { api, settings, viewer, fileSelection } = useApp()
  const files = useSession(selectFiles)
  const { view, show } = useView()
  const git = useGit()
  // The Files view searches every file in the repo, read once when the palette first opens there.
  const [tree, setTree] = useState<string[] | null>(null)
  useEffect(() => {
    if (open && view === 'files' && tree === null) api.tree().then(setTree, () => setTree([]))
  }, [open, view, tree, api])
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
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="Go to">
          {VIEWS.filter((entry) => entry.view !== view).map((entry) => (
            <CommandItem key={entry.view} value={`go to ${entry.label}`} onSelect={() => run(() => show(entry.view))}>
              {entry.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {view === 'files' ? (
          <CommandGroup heading="Open file">
            {(tree ?? []).map((path) => (
              <CommandItem key={path} value={`open ${path}`} onSelect={() => run(() => fileSelection.set(path))}>
                <span className="truncate font-mono">{path}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        <CommandGroup heading="Git">
          <CommandItem value="git fetch" onSelect={() => run(() => void git.run('fetch', undefined, 'Fetched'))}>
            Fetch every remote
          </CommandItem>
          <CommandItem value="git pull" onSelect={() => run(() => void git.run('pull', undefined, 'Pulled'))}>
            Pull
          </CommandItem>
          <CommandItem value="git push" onSelect={() => run(() => void git.run('push', undefined, 'Pushed'))}>
            Push
          </CommandItem>
          <CommandItem
            value="git stash changes"
            onSelect={() => run(() => void git.run('stash', { message: '', untracked: true }, 'Stashed your changes'))}>
            Stash every change
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Changed files">
          {files.map((file) => (
            <CommandItem
              key={file.path}
              value={`file ${file.path}`}
              onSelect={() =>
                run(() => {
                  show('changes')
                  viewer.current?.scrollTo({ type: 'item', id: itemId(file.path), align: 'start' })
                })
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
