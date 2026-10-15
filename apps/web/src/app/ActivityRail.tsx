import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { CircleDot, FileDiff, FolderTree, GitGraph, GitPullRequest } from 'lucide-react'
import { useView } from '../hooks/useView'
import type { View } from '../lib/view-url'

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
