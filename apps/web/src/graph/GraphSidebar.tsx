import type { Ref } from '@duck-diff/protocol'
import {
  Button,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@duck-diff/ui'
import { ArchiveRestore, PackageOpen, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { useApp } from '../app/AppProvider'
import { useGit } from '../git/GitProvider'
import { useRefs } from '../hooks/useRefs'
import { useStore } from '../lib/store'
import type { GraphState } from './store'

const GROUPS: { kind: Ref['kind']; title: string; glyph: string }[] = [
  { kind: 'branch', title: 'Branches', glyph: '' },
  { kind: 'remote', title: 'Remote branches', glyph: '' },
  { kind: 'tag', title: 'Tags', glyph: '' },
  { kind: 'stash', title: 'Stashes', glyph: '' },
]

const selectAll = (state: GraphState) => state.all

function StashTool({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// Hidden until hover or focus so the list reads as names; keyboard users still tab onto them.
function StashActions({ name }: { name: string }) {
  const { run } = useGit()
  return (
    <span className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
      <StashTool
        label={`Apply ${name}`}
        onClick={() => void run('stash-apply', { name, pop: false }, `Applied ${name}`)}>
        <ArchiveRestore />
      </StashTool>
      <StashTool label={`Pop ${name}`} onClick={() => void run('stash-apply', { name, pop: true }, `Popped ${name}`)}>
        <PackageOpen />
      </StashTool>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={`Drop ${name}`}>
            <Trash2 />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-72 flex-col gap-2">
          <p>Drop {name}? Its changes are gone after this.</p>
          <Button
            size="sm"
            variant="destructive"
            className="self-end"
            onClick={() => void run('stash-drop', { name }, `Dropped ${name}`)}>
            Drop stash
          </Button>
        </PopoverContent>
      </Popover>
    </span>
  )
}

export function GraphSidebar() {
  const { graph, graphSelection } = useApp()
  const { refs } = useRefs()
  const all = useStore(graph, selectAll)
  const allId = useId()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-border border-b p-3">
        <Label htmlFor={allId}>Every branch</Label>
        <Switch
          id={allId}
          className="border-muted-foreground"
          checked={all}
          onCheckedChange={(checked) => graph.setAll(Boolean(checked))}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {GROUPS.map(({ kind, title, glyph }) => {
          const list = refs.filter((ref) => ref.kind === kind)
          if (list.length === 0) return null
          return (
            <section key={kind} aria-label={title} className="mb-3">
              <h3 className="px-2 pb-1 text-tn-comment">{title}</h3>
              {list.map((ref) => (
                <div key={ref.name} className="group flex items-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-w-0 flex-1 justify-start gap-2"
                    title={ref.subject ?? ref.name}
                    onClick={() => graphSelection.set(ref.sha)}>
                    <span className={`w-5 shrink-0 text-center ${ref.current ? 'text-tn-green' : 'text-tn-blue'}`}>
                      {glyph}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-start">
                      {kind === 'stash' ? (ref.subject ?? ref.name) : ref.name}
                    </span>
                    {ref.current ? <span className="text-tn-green">current</span> : null}
                  </Button>
                  {kind === 'stash' ? <StashActions name={ref.name} /> : null}
                </div>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
