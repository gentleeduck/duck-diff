import type { Worktree } from '@duck-diff/protocol'
import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { Check, FolderGit2, GitBranch, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { useOpenRepo } from '../hooks/useOpenRepo'
import type { RepoEntry } from '../lib/api'
import { useApp } from './AppProvider'
import { CheckoutCard, CheckoutHover, TAG_TONE, type TreeTag, treeTag, WorktreeCard } from './CheckoutCard'
import { IconTool } from './IconTool'
import { Dot, TextLine } from './skeletons'

const NO_REPOS: RepoEntry[] = []
const NO_TREES: Worktree[] = []

// One checkout in the list: a single line. The card on hover hangs off its whole row (see CheckoutHover), so it
// never covers the row's own buttons.
function Row({
  icon,
  name,
  detail,
  tag,
  openable,
  onOpen,
}: {
  icon: ReactNode
  name: string
  detail?: string
  tag: TreeTag | null
  openable: boolean
  onOpen(): void
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-disabled={!openable || undefined}
      className="w-full min-w-0 justify-start gap-2 aria-disabled:cursor-default aria-disabled:hover:bg-transparent"
      onClick={() => openable && onOpen()}>
      {icon}
      <span className="min-w-0 shrink truncate">{name}</span>
      {tag ? (
        <Badge variant={TAG_TONE[tag]} size="sm" className="shrink-0 bg-transparent">
          {tag}
        </Badge>
      ) : null}
      {detail ? <span className="min-w-0 flex-[1_1_0] truncate text-start text-muted-foreground">{detail}</span> : null}
    </Button>
  )
}

// Every repository opened before, and this one's other worktrees, one page each: picking one opens it in its
// own window, served by a server this one starts, so each keeps its own history and saved lists.
export function RepoSwitcher() {
  const { api, queries } = useApp()
  const [open, setOpen] = useState(false)
  const list = useQuery({ ...queries.git.repos(), enabled: open })
  const treeList = useQuery({ ...queries.git.worktrees(), enabled: open })
  const trees = treeList.data ?? NO_TREES
  // Both lists before either, so a worktree never shows under Repositories for a moment first.
  const loading = list.isPending || treeList.isPending
  // Each checkout shows once: this repo's worktrees (found by git, this one among them) under Worktrees, and
  // only other repositories under Repositories.
  const worktrees = trees.length > 1 ? trees : NO_TREES
  const inTrees = new Set(worktrees.map((tree) => tree.path))
  const repos = (list.data ?? NO_REPOS).filter((repo) => !inTrees.has(repo.path))
  const openRepo = useOpenRepo()
  const [path, setPath] = useState('')
  const [adding, setAdding] = useState(false)

  const go = async (target: string) => {
    if (await openRepo(target)) setOpen(false)
  }
  const add = async () => {
    if (!path.trim()) return
    setAdding(true)
    try {
      const added = await api.addRepo(path.trim())
      setPath('')
      await list.refetch()
      toast.success('Added a repository', { description: added })
    } catch (error) {
      toast.error('Could not add that folder', { description: (error as Error).message })
    } finally {
      setAdding(false)
    }
  }
  const forget = async (target: string) => {
    try {
      await api.removeRepo(target)
      await list.refetch()
    } catch (error) {
      toast.error('Could not forget that repository', { description: (error as Error).message })
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="Repositories">
              <FolderGit2 />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Repositories</TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="end" className="flex w-96 max-w-[calc(100vw-4rem)] flex-col gap-2 p-2">
        {loading ? (
          <div role="status" aria-label="Loading repositories" className="flex flex-col">
            {['w-24', 'w-32', 'w-20'].map((width) => (
              <div key={width} className="flex h-7 items-center gap-2 px-2">
                <Dot />
                <TextLine className={width} />
              </div>
            ))}
          </div>
        ) : null}
        {!loading && worktrees.length ? (
          <>
            <h3 className="px-2 text-tn-comment">Worktrees</h3>
            <ul aria-label="Worktrees" className="flex max-h-72 flex-col overflow-y-auto border-border border-b pb-2">
              {worktrees.map((tree) => {
                const name = tree.branch ?? tree.head?.slice(0, 7) ?? 'detached'
                const openable = !tree.current && !tree.prunable
                return (
                  <CheckoutHover key={tree.path} card={<WorktreeCard tree={tree} />}>
                    <li>
                      <Row
                        icon={tree.current ? <Check className="text-tn-green" /> : <GitBranch />}
                        name={name}
                        tag={treeTag(tree)}
                        openable={openable}
                        onOpen={() => void go(tree.path)}
                      />
                    </li>
                  </CheckoutHover>
                )
              })}
            </ul>
            <h3 className="px-2 text-tn-comment">Repositories</h3>
          </>
        ) : null}
        {list.isError ? (
          <div role="alert" className="flex items-center gap-2 px-2">
            <p className="min-w-0 flex-1 text-destructive">
              Could not list repositories: {(list.error as Error).message}
            </p>
            <Button size="sm" variant="ghost" onClick={() => void list.refetch()}>
              Retry
            </Button>
          </div>
        ) : !loading && repos.length === 0 ? (
          <p className="px-2 text-muted-foreground">
            No other repositories yet. Add a folder below to switch to it here.
          </p>
        ) : null}
        <ul aria-label="Repositories" className="flex max-h-72 flex-col overflow-y-auto empty:hidden">
          {repos.map((repo) => (
            <CheckoutHover
              key={repo.path}
              card={
                <CheckoutCard
                  title={repo.name}
                  path={repo.path}
                  kind={repo.current ? 'The repository this page shows.' : 'A repository you opened before.'}
                  tag={repo.current ? 'here' : null}
                  hint={repo.current ? 'You are here.' : 'Click to open it in its own window.'}
                />
              }>
              <li className="group flex min-w-0 items-center gap-1">
                <div className="min-w-0 flex-1">
                  <Row
                    icon={repo.current ? <Check className="text-tn-green" /> : <FolderGit2 />}
                    name={repo.name}
                    detail={repo.path}
                    tag={repo.current ? 'here' : null}
                    openable={!repo.current}
                    onOpen={() => void go(repo.path)}
                  />
                </div>
                {!repo.current ? (
                  <span className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                    <IconTool
                      destructive
                      label={`Forget ${repo.path}`}
                      tip="Forget it"
                      onClick={() => void forget(repo.path)}>
                      <X />
                    </IconTool>
                  </span>
                ) : null}
              </li>
            </CheckoutHover>
          ))}
        </ul>
        <form
          className="flex gap-1 border-border border-t pt-2"
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}>
          <Input
            aria-label="Repository folder"
            placeholder="/path/to/repository"
            value={path}
            onChange={(event) => setPath(event.target.value)}
          />
          <Button type="submit" size="sm" loading={adding} disabled={!path.trim()}>
            Add
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
