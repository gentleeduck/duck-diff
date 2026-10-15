import type { ChangedFile, FileStatus } from '@duck-diff/protocol'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@duck-diff/ui'
import { ChevronDown, ChevronRight, Minus, Plus, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { useCanOpen } from '../hooks/useCanOpen'
import { useTarget } from '../hooks/useTarget'
import { itemId } from '../lib/items'
import { useStore } from '../lib/store'
import { fileGlyph } from '../sidebar/icons'
import { FileMenu } from '../sidebar/tree-menus'
import type { StageState } from '../state/stage'
import type { WriteKind } from '../viewer/actions'
import { useWrites } from '../writes/WritesProvider'
import { useGit } from './GitProvider'

// The letters git and VS Code use, colored like the tree's status marks.
const LETTER: Record<FileStatus, { letter: string; className: string }> = {
  modified: { letter: 'M', className: 'text-tn-yellow' },
  'type-changed': { letter: 'T', className: 'text-tn-yellow' },
  added: { letter: 'A', className: 'text-added' },
  untracked: { letter: 'U', className: 'text-added' },
  copied: { letter: 'C', className: 'text-added' },
  renamed: { letter: 'R', className: 'text-tn-magenta' },
  deleted: { letter: 'D', className: 'text-removed' },
  conflicted: { letter: '!', className: 'text-removed' },
}

const selectStage = (state: StageState) => state

function Row({
  file,
  side,
  selected,
  onSelect,
}: {
  file: ChangedFile
  side: 'staged' | 'unstaged'
  selected: boolean
  onSelect(): void
}) {
  const { api, fileHistory, session, viewer } = useApp()
  const { target, navigate } = useTarget()
  const writes = useWrites()
  const canOpen = useCanOpen()
  const name = file.path.split('/').pop() ?? file.path
  const folder = file.path.slice(0, file.path.length - name.length - 1)
  const icon = fileGlyph(name)
  const mark = LETTER[file.status]
  const conflicted = file.status === 'conflicted'
  const kinds: WriteKind[] = conflicted ? [] : side === 'staged' ? ['unstage'] : ['stage', 'discard']
  const current = selected && target.kind === side
  // The diff switches to this side of the index, then scrolls to the file once it has loaded.
  const open = () => {
    onSelect()
    const reveal = () => viewer.current?.scrollTo({ type: 'item', id: itemId(file.path), align: 'start' })
    if (target.kind === side && session.get().status === 'ready') return reveal()
    if (target.kind !== side) navigate({ kind: side })
    const stop = session.subscribe(() => {
      if (session.get().status !== 'ready') return
      stop()
      requestAnimationFrame(reveal)
    })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="option"
          tabIndex={0}
          aria-selected={current}
          title={file.path}
          onClick={open}
          onKeyDown={(event) => {
            if (event.key === 'Enter') open()
          }}
          className="group flex h-7 cursor-pointer items-center gap-2 rounded-sm pe-1 ps-3 hover:bg-accent/60 aria-selected:bg-accent">
          <span className="w-5 shrink-0 text-center" style={{ color: icon.color }}>
            {icon.glyph}
          </span>
          <span className={`min-w-0 truncate ${file.status === 'deleted' ? 'line-through' : ''}`}>{name}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{folder}</span>
          <span className="hidden shrink-0 group-focus-within:flex group-hover:flex">
            {kinds.includes('discard') ? (
              <IconTool
                label={`Discard ${file.path}`}
                tip="Discard changes"
                onClick={() => void writes.perform('discard', file)}>
                <Undo2 />
              </IconTool>
            ) : null}
            {kinds.includes('stage') ? (
              <IconTool label={`Stage ${file.path}`} tip="Stage" onClick={() => void writes.perform('stage', file)}>
                <Plus />
              </IconTool>
            ) : null}
            {kinds.includes('unstage') ? (
              <IconTool
                label={`Unstage ${file.path}`}
                tip="Unstage"
                onClick={() => void writes.perform('unstage', file)}>
                <Minus />
              </IconTool>
            ) : null}
          </span>
          <span className={`w-5 shrink-0 text-center ${mark.className}`} title={file.status}>
            {mark.letter}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <FileMenu
          path={file.path}
          openLabel="Show changes"
          onOpen={open}
          onHistory={() => fileHistory.set(file.path)}
          onNeovim={canOpen ? () => void api.open(file.path, 1) : undefined}
          writes={kinds}
          onWrite={(kind) => void writes.perform(kind, file)}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}

function Section({
  title,
  files,
  side,
  actions,
  selected,
  onSelect,
}: {
  title: string
  files: ChangedFile[]
  side: 'staged' | 'unstaged'
  actions: React.ReactNode
  selected: string | null
  onSelect(key: string): void
}) {
  const [open, setOpen] = useState(true)
  return (
    <section aria-label={title} className="flex flex-col">
      <div className="group flex h-7 items-center gap-1 pe-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-start text-tn-comment">
          {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
          <span className="truncate">{title}</span>
        </button>
        {files.length ? <span className="flex">{actions}</span> : null}
        <span className="min-w-6 rounded-sm bg-muted px-1.5 text-center text-muted-foreground tabular-nums">
          {files.length}
        </span>
      </div>
      {open ? (
        <div role="listbox" aria-label={title}>
          {files.map((file) => (
            <Row
              key={`${side}:${file.path}`}
              file={file}
              side={side}
              selected={selected === `${side}:${file.path}`}
              onSelect={() => onSelect(`${side}:${file.path}`)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

// The index at a glance, like an editor's source control view: what will be committed, and what will not.
export function StagePanel() {
  const { stage } = useApp()
  const { run } = useGit()
  const state = useStore(stage, selectStage)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => stage.load(), [stage])

  if (!state.loaded) return <p className="p-3 text-muted-foreground">Reading the index...</p>
  if (!state.staged.length && !state.unstaged.length) {
    return <p className="p-3 text-muted-foreground">Nothing to commit. The working tree is clean.</p>
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
      <Section
        title="Staged changes"
        side="staged"
        files={state.staged}
        selected={selected}
        onSelect={setSelected}
        actions={
          <IconTool label="Unstage all" onClick={() => void run('unstage-all', undefined, 'Unstaged everything')}>
            <Minus />
          </IconTool>
        }
      />
      <Section
        title="Changes"
        side="unstaged"
        files={state.unstaged}
        selected={selected}
        onSelect={setSelected}
        actions={
          <IconTool label="Stage all" onClick={() => void run('stage-all', undefined, 'Staged everything')}>
            <Plus />
          </IconTool>
        }
      />
    </div>
  )
}
