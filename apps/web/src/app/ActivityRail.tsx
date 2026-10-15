import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import {
  Bell,
  ChartColumn,
  CircleDot,
  FileDiff,
  FolderTree,
  GitGraph,
  GitPullRequest,
  MessagesSquare,
  PlayCircle,
  Rocket,
  ShieldAlert,
} from 'lucide-react'
import { useView } from '../hooks/useView'
import type { View } from '../lib/view-url'
import { RepoSwitcher } from './RepoSwitcher'

const ITEMS: { view: View; label: string; icon: typeof FileDiff }[] = [
  { view: 'changes', label: 'Changes', icon: FileDiff },
  { view: 'graph', label: 'Commit graph', icon: GitGraph },
  { view: 'files', label: 'Files', icon: FolderTree },
  { view: 'prs', label: 'Pull requests', icon: GitPullRequest },
  { view: 'issues', label: 'Issues', icon: CircleDot },
  { view: 'inbox', label: 'Notifications', icon: Bell },
  { view: 'releases', label: 'Releases', icon: Rocket },
  { view: 'actions', label: 'Actions', icon: PlayCircle },
  { view: 'discussions', label: 'Discussions', icon: MessagesSquare },
  { view: 'security', label: 'Security', icon: ShieldAlert },
  { view: 'insights', label: 'Insights', icon: ChartColumn },
]

// Views appear here as they ship, so the rail never offers an empty screen.
export function ActivityRail({
  views,
  badges = {},
}: {
  views: readonly View[]
  badges?: Partial<Record<View, number>>
}) {
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
              aria-label={badges[id] ? `${label}, ${badges[id]} unread` : label}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => show(id)}
              className="relative aria-[current=page]:bg-accent aria-[current=page]:text-tn-blue">
              <Icon />
              {badges[id] ? (
                <span className="absolute end-0.5 top-0.5 min-w-3.5 rounded-full bg-tn-blue px-1 text-[0.625rem] text-background leading-3.5">
                  {badges[id] > 99 ? '99+' : badges[id]}
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{badges[id] ? `${label} (${badges[id]} unread)` : label}</TooltipContent>
        </Tooltip>
      ))}
      <RepoSwitcher />
    </nav>
  )
}
