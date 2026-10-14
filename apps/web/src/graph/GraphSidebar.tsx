import type { Ref } from '@duck-diff/protocol'
import { Button, Label, Switch } from '@duck-diff/ui'
import { useId } from 'react'
import { useApp } from '../app/AppProvider'
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
                <Button
                  key={ref.name}
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start gap-2"
                  title={ref.subject ?? ref.name}
                  onClick={() => graphSelection.set(ref.sha)}>
                  <span className={`w-5 shrink-0 text-center ${ref.current ? 'text-tn-green' : 'text-tn-blue'}`}>
                    {glyph}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-start">{ref.name}</span>
                  {ref.current ? <span className="text-tn-green">current</span> : null}
                </Button>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
