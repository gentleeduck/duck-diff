import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@duck-diff/ui'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { presets } from '../compare/model'
import { openFile } from '../files/open-file'
import { useGit } from '../git/GitProvider'
import { IssueIcon } from '../github/IssuesList'
import type { IndexedItem, ItemIndexState } from '../github/item-index'
import { PullIcon } from '../github/PullsList'
import { useRefs } from '../hooks/useRefs'
import { useSession } from '../hooks/useSession'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { useStore } from '../lib/store'
import type { View } from '../lib/view-url'
import { fileGlyph } from '../sidebar/icons'
import type { SessionState } from '../state/session'
import type { Settings } from '../state/settings'
import { useWrites } from '../writes/WritesProvider'
import { Preview, type PreviewTarget } from './Preview'
import { parseSearch, rank } from './rank'

const selectFiles = (state: SessionState) => state.files
const selectItems = (state: ItemIndexState) => state.items
// The saved list is read again when the palette opens and it is older than this.
const STALE_MS = 60_000

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
  { view: 'inbox', label: 'Notifications' },
  { view: 'releases', label: 'Releases' },
  { view: 'actions', label: 'Actions' },
]

const SCOPES: { prefix: string; label: string }[] = [
  { prefix: 'file:', label: 'Files' },
  { prefix: 'pr:', label: 'Pull requests' },
  { prefix: 'issue:', label: 'Issues' },
  { prefix: '#', label: 'By number' },
  { prefix: '>', label: 'Commands' },
]

interface Entry {
  id: string
  label: ReactNode
  detail?: string
  icon?: ReactNode
  preview: PreviewTarget
  run(): void
}

const fileIcon = (path: string) => {
  const glyph = fileGlyph(path.split('/').pop() ?? path)
  return <span style={{ color: glyph.color }}>{glyph.glyph}</span>
}

// GitHub's command palette: one box for files, pull requests, issues and commands, narrowed with file:,
// pr:, issue:, #123 or >, and a preview of the highlighted result beside the list.
export function Palette({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const app = useApp()
  const { api, settings, diffFile, pullSelection, issueSelection, items } = app
  const changed = useSession(selectFiles)
  const indexed = useStore(items, selectItems)
  const { view, show } = useView()
  const git = useGit()
  const { navigate } = useTarget()
  const refs = useRefs()
  const writes = useWrites()
  const [input, setInput] = useState('')
  const [active, setActive] = useState('')
  const [tree, setTree] = useState<string[] | null>(null)
  const { scope, term } = parseSearch(input)

  useEffect(() => {
    if (!open) return
    setInput('')
    void items.refresh(STALE_MS)
  }, [open, items])
  // Every file in the repo, read once the search can need them.
  useEffect(() => {
    if (open && tree === null && (scope === 'file' || (scope === 'all' && term))) {
      api.tree().then(setTree, () => setTree([]))
    }
  }, [open, tree, scope, term, api])

  // Read through a ref so the result list below is rebuilt only when what it shows changes.
  const latest = useRef({ onOpenChange, pullSelection, issueSelection })
  latest.current = { onOpenChange, pullSelection, issueSelection }

  const groups = useMemo(() => {
    const close = (action: () => void) => () => {
      latest.current.onOpenChange(false)
      action()
    }
    const openItem = (item: IndexedItem) =>
      close(() => {
        show(item.kind === 'pr' ? 'prs' : 'issues')
        ;(item.kind === 'pr' ? latest.current.pullSelection : latest.current.issueSelection).set(item.number)
      })
    const branches = refs.refs.filter((ref) => ref.kind === 'branch').map((ref) => ref.name)
    const commands: Entry[] = [
      ...VIEWS.filter((entry) => entry.view !== view).map((entry) => ({
        id: `go ${entry.label}`,
        label: `Go to ${entry.label}`,
        preview: null,
        run: close(() => show(entry.view)),
      })),
      {
        id: 'git fetch',
        label: 'Fetch every remote',
        preview: null,
        run: close(() => void git.run('fetch', undefined, 'Fetched')),
      },
      { id: 'git pull', label: 'Pull', preview: null, run: close(() => void git.run('pull', undefined, 'Pulled')) },
      { id: 'git push', label: 'Push', preview: null, run: close(() => void git.run('push', undefined, 'Pushed')) },
      {
        id: 'git stash',
        label: 'Stash every change',
        preview: null,
        run: close(() => void git.run('stash', { message: '', untracked: true }, 'Stashed your changes')),
      },
      { id: 'undo discard', label: 'Undo last discard', preview: null, run: close(() => void writes.undo()) },
      ...presets(branches).map((preset) => ({
        id: `compare ${preset.label}`,
        label: `Compare: ${preset.label}`,
        preview: null,
        run: close(() => navigate(preset.target)),
      })),
      ...branches.map((name) => ({
        id: `compare branch ${name}`,
        label: `Compare this branch against ${name}`,
        preview: null,
        run: close(() => navigate({ kind: 'range', from: name, to: 'HEAD', mode: 'merge-base' })),
      })),
      ...TOGGLES.map((toggle) => ({
        id: `view ${toggle.label}`,
        label: toggle.label,
        preview: null,
        run: close(() => settings.set(toggle.apply)),
      })),
    ]
    const itemEntry = (item: IndexedItem): Entry => ({
      id: `${item.kind} ${item.number}`,
      label: (
        <span className="min-w-0 truncate">
          {item.title} <span className="text-muted-foreground">#{item.number}</span>
        </span>
      ),
      detail: item.author,
      icon: item.kind === 'pr' ? <PullIcon pull={item} /> : <IssueIcon state={item.state} />,
      preview: { kind: 'item', item },
      run: openItem(item),
    })
    const itemText = (item: IndexedItem) =>
      `#${item.number} ${item.title} ${item.author} ${item.labels.map((label) => label.name).join(' ')}`
    const pulls = indexed.filter((item) => item.kind === 'pr')
    const issues = indexed.filter((item) => item.kind === 'issue')
    const fileEntry = (path: string): Entry => ({
      id: `file ${path}`,
      label: <span className="min-w-0 truncate">{path}</span>,
      icon: fileIcon(path),
      preview: { kind: 'file', path },
      run: close(() => {
        openFile(app, path)
        show('files')
      }),
    })
    const changedEntry = (path: string): Entry => ({
      id: `changed ${path}`,
      label: <span className="min-w-0 truncate">{path}</span>,
      detail: 'changed',
      icon: fileIcon(path),
      preview: { kind: 'file', path },
      run: close(() => {
        show('changes')
        diffFile.set(path)
      }),
    })

    const list: { heading: string; entries: Entry[] }[] = []
    if (scope === 'file')
      list.push({ heading: 'Files', entries: rank(tree ?? [], term, (path) => path, 60).map(fileEntry) })
    else if (scope === 'pr')
      list.push({ heading: 'Pull requests', entries: rank(pulls, term, itemText, 60).map(itemEntry) })
    else if (scope === 'issue')
      list.push({ heading: 'Issues', entries: rank(issues, term, itemText, 60).map(itemEntry) })
    else if (scope === 'number')
      list.push({
        heading: 'Pull requests and issues',
        entries: indexed
          .filter((item) => String(item.number).startsWith(term))
          .sort((a, b) => a.number - b.number)
          .slice(0, 60)
          .map(itemEntry),
      })
    else if (scope === 'command')
      list.push({ heading: 'Commands', entries: rank(commands, term, (entry) => entry.id, 80) })
    else {
      list.push({
        heading: 'Changed files',
        entries: rank(
          changed.map((file) => file.path),
          term,
          (path) => path,
          6,
        ).map(changedEntry),
      })
      if (term) {
        list.push({ heading: 'Pull requests', entries: rank(pulls, term, itemText, 5).map(itemEntry) })
        list.push({ heading: 'Issues', entries: rank(issues, term, itemText, 5).map(itemEntry) })
        list.push({ heading: 'Files', entries: rank(tree ?? [], term, (path) => path, 8).map(fileEntry) })
      }
      list.push({ heading: 'Commands', entries: rank(commands, term, (entry) => entry.id, term ? 8 : 12) })
    }
    return list.filter((group) => group.entries.length)
  }, [scope, term, tree, indexed, changed, refs, view, app, show, git, writes, navigate, settings, diffFile])

  // The list marks the highlighted result itself; the preview follows that mark.
  const results = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = results.current
    if (!open || !root) return
    const observer = new MutationObserver(() => {
      const marked = root.querySelector<HTMLElement>('[data-highlighted]')
      if (marked?.dataset.value) setActive(marked.dataset.value)
    })
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-highlighted'] })
    return () => observer.disconnect()
  })

  const all = groups.flatMap((group) => group.entries)
  const current = all.find((entry) => entry.id === active) ?? all[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(36rem,85vh)] w-[min(64rem,95vw)] max-w-none p-0" hideClose>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Files, pull requests, issues and commands</DialogDescription>
        <Command shouldFilter={false} className="flex h-full max-w-none flex-col">
          <CommandInput
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              // Nothing highlighted yet: Enter takes the top result, as GitHub's palette does.
              if (event.key !== 'Enter' || results.current?.querySelector('[data-highlighted]')) return
              event.preventDefault()
              current?.run()
            }}
            placeholder="Search files, pull requests and issues, or > for commands"
          />
          <div ref={results} className="flex min-h-0 flex-1">
            <CommandList className="max-h-none min-w-0 flex-1 overflow-y-auto">
              <CommandEmpty>
                {scope === 'file' && tree === null ? 'Reading the file list...' : 'Nothing matches.'}
              </CommandEmpty>
              {groups.map((group) => (
                <CommandGroup key={group.heading} heading={group.heading}>
                  {group.entries.map((entry) => (
                    <CommandItem key={entry.id} value={entry.id} onSelect={entry.run} className="gap-2">
                      {entry.icon}
                      {entry.label}
                      {entry.detail ? (
                        <span className="ms-auto shrink-0 text-muted-foreground">{entry.detail}</span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
            <div className="hidden w-[26rem] shrink-0 border-border border-s md:block">
              <Preview target={current?.preview ?? null} />
            </div>
          </div>
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-border border-t px-3 py-1.5 text-muted-foreground">
            Narrow with
            {SCOPES.map((entry) => (
              <button
                key={entry.prefix}
                type="button"
                onClick={() => setInput(`${entry.prefix}${entry.prefix.endsWith(':') ? ' ' : ''}${term}`)}
                className="cursor-pointer rounded-sm border border-border px-1.5 hover:text-foreground"
                title={entry.label}>
                <code>{entry.prefix}</code>
              </button>
            ))}
          </footer>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
