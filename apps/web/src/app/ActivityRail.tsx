import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { CircleDot, FileDiff, FolderTree, GitGraph, GitPullRequest, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { useView } from '../hooks/useView'
import type { View } from '../lib/view-url'
import type { Settings } from '../state/settings'
import { useApp } from './AppProvider'

const ITEMS: { view: View; label: string; icon: typeof FileDiff }[] = [
  { view: 'changes', label: 'Changes', icon: FileDiff },
  { view: 'graph', label: 'Commit graph', icon: GitGraph },
  { view: 'files', label: 'Files', icon: FolderTree },
  { view: 'prs', label: 'Pull requests', icon: GitPullRequest },
  { view: 'issues', label: 'Issues', icon: CircleDot },
]

// Views appear here as they ship, so the rail never offers an empty screen.
export function ActivityRail({ views }: { views: readonly View[] }) {
  const { view, show } = useView()
  return (
    <nav
      aria-label="Views"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-border border-e bg-card py-2">
      <PanelToggle />
      {ITEMS.filter((item) => views.includes(item.view)).map(({ view: id, label, icon: Icon }) => (
        <Tooltip key={id}>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label={label}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => show(id)}
              className="aria-[current=page]:bg-accent aria-[current=page]:text-tn-blue">
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
    </nav>
  )
}

const selectPanel = (state: Settings) => state.sidebar

// Hides the left panel for a wider page; Ctrl B does the same.
function PanelToggle() {
  const { settings } = useApp()
  const shown = useSettings(selectPanel)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={shown ? 'Hide the left panel' : 'Show the left panel'}
          aria-pressed={!shown}
          onClick={() => settings.set((prev) => ({ ...prev, sidebar: !prev.sidebar }))}
          className="mb-1">
          {shown ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {shown ? 'Hide the left panel (Ctrl B)' : 'Show the left panel (Ctrl B)'}
      </TooltipContent>
    </Tooltip>
  )
}
