import type { ToolSpec } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import { ArrowRight, GitCompareArrows } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RebaseTodo } from '../graph/RebaseTodo'
import { useSettings } from '../hooks/useSettings'
import { useShortcuts } from '../keys/useShortcuts'
import { useStore } from '../lib/store'
import type { ToolState } from '../lib/tool'
import { useLiveRefresh } from '../live/useLiveRefresh'
import MergeEditor from '../merge/MergeEditor'
import { MergeHeader } from '../merge/MergeHeader'
import { MergeSidebar } from '../merge/MergeSidebar'
import { panelShown, type Settings, togglePanel } from '../state/settings'
import Viewer from '../viewer/Viewer'
import { useApp } from './AppProvider'
import { Shell } from './Shell'
import { useSizes } from './useSizes'
import { useThemeClass } from './useThemeClass'

const selectTool = (state: ToolState) => state
// Long enough for git to ask for its next file before this window goes.
const CLOSE_MS = 3000

function DiffBar({ spec }: { spec: Extract<ToolSpec, { kind: 'diff' }> }) {
  const { api } = useApp()
  const [busy, setBusy] = useState(false)
  const next = async () => {
    setBusy(true)
    try {
      await api.finishTool({ id: spec.id, ok: true })
    } catch (error) {
      toast.error('git did not hear back', { description: (error as Error).message })
      setBusy(false)
    }
  }
  return (
    <>
      <h1 className="flex min-w-0 flex-1 items-center gap-2">
        <GitCompareArrows className="size-4 shrink-0 text-tn-blue" />
        <span className="shrink-0">git difftool</span>
        <span className="min-w-0 truncate text-muted-foreground" title={spec.path}>
          {spec.path}
        </span>
      </h1>
      <Button size="sm" loading={busy} onClick={() => void next()}>
        Next file
        <ArrowRight />
      </Button>
    </>
  )
}

function Closing({ failed }: { failed: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className={failed ? 'text-removed' : 'text-tn-green'}>
        {failed ? 'git is no longer waiting on this window.' : 'Done. git has it from here.'}
      </p>
      <p className="text-muted-foreground">This window can be closed.</p>
    </div>
  )
}

// The window git opens when duck-diff runs as its merge tool, diff tool or rebase todo editor: only what git
// handed over, with no rail, panels or other pages, and gone once git has what it asked for.
export function ToolScreen() {
  useThemeClass()
  useSizes()
  useShortcuts({ palette: () => {}, shortcuts: () => {} })
  useLiveRefresh()
  const { tool, place, mergeFile, settings } = useApp()
  const { spec, done } = useStore(tool, selectTool)
  const [closed, setClosed] = useState(false)
  const mergeTree = useSettings(useCallback((state: Settings) => panelShown(state, 'merge'), []))

  // What git handed over sets the page: the comparison of a difftool file, the file a mergetool waits on.
  useEffect(() => {
    if (spec?.kind === 'diff') place.set((now) => ({ ...now, view: 'changes', target: spec.target }))
    if (spec?.kind === 'merge') mergeFile.set(spec.path)
  }, [spec, place, mergeFile])

  // Once git has what it asked for, the window goes, unless git asks for more first.
  useEffect(() => {
    setClosed(false)
    if (!done) return
    const timer = setTimeout(() => {
      setClosed(true)
      window.close()
    }, CLOSE_MS)
    return () => clearTimeout(timer)
  }, [done])

  if (closed || (done && !spec)) return <Closing failed={!spec} />
  if (!spec) return <div className="h-full" />
  if (spec.kind === 'rebase') return <RebaseTodo key={spec.id} spec={spec} />
  const status = (
    <span className="truncate">
      git {spec.kind === 'merge' ? 'mergetool' : 'difftool'} is waiting on {spec.path}
    </span>
  )
  if (spec.kind === 'merge')
    return (
      <Shell
        rail={null}
        topBar={<MergeHeader />}
        sidebar={<MergeSidebar />}
        sidebarLabel="Conflicted files"
        panelShown={mergeTree}
        onTogglePanel={() => settings.set((prev) => togglePanel(prev, 'merge'))}
        viewer={<MergeEditor />}
        status={status}
      />
    )
  return (
    <Shell
      rail={null}
      topBar={<DiffBar spec={spec} />}
      sidebar={null}
      sidebarLabel="Files"
      panelShown={false}
      onTogglePanel={() => {}}
      viewer={<Viewer />}
      status={status}
    />
  )
}
