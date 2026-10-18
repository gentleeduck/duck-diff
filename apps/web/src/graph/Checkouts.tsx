import type { Submodule, Worktree } from '@duck-diff/protocol'
import { Badge, Button } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { FolderInput, Plus, RefreshCw, Scissors, SquareArrowOutUpRight, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { CheckoutHover, TAG_TONE, treeTag, WorktreeCard } from '../app/CheckoutCard'
import { IconTool } from '../app/IconTool'
import { useGit } from '../git/GitProvider'
import { useNeovim } from '../hooks/useNeovim'
import { useOpenRepo } from '../hooks/useOpenRepo'
import { useRefs } from '../hooks/useRefs'

const short = (sha: string | null) => (sha ? sha.slice(0, 7) : 'none')
const leaf = (path: string) => path.split('/').filter(Boolean).pop() ?? path
const NO_TREES: Worktree[] = []
const NO_MODULES: Submodule[] = []

export function Worktrees() {
  const { api, queries } = useApp()
  const { run } = useGit()
  const { refs } = useRefs()
  const neovim = useNeovim()
  const open = useOpenRepo()
  const trees = useQuery(queries.git.worktrees()).data ?? NO_TREES

  const add = async () => {
    const root = trees.find((tree) => tree.main)?.path ?? ''
    const values = await ask.prompt({
      title: 'Add a worktree',
      body: 'A second checkout of this repository in its own folder, on its own branch.',
      fields: [
        { name: 'branch', label: 'Branch (an existing one, or a new name)', placeholder: 'feat/next' },
        { name: 'path', label: 'Folder', placeholder: root ? `${root}-next` : '/path/to/folder' },
        { name: 'start', label: 'Start a new branch from (defaults to HEAD)', optional: true },
      ],
      action: 'Add worktree',
    })
    if (!values) return
    const create = !refs.some((ref) => ref.kind === 'branch' && ref.name === values.branch)
    await run(
      'worktree-add',
      { path: values.path, branch: values.branch, create, ...(create && values.start ? { start: values.start } : {}) },
      `Added a worktree for ${values.branch}`,
    )
  }
  const remove = async (tree: Worktree) => {
    const yes = await ask.confirm({
      title: 'Remove this worktree',
      body: 'Deletes the folder. Its branch and commits stay. Uncommitted changes there stop the removal.',
      detail: tree.path,
      action: 'Remove',
      destructive: true,
    })
    if (yes) await run('worktree-remove', { path: tree.path, force: false }, `Removed ${leaf(tree.path)}`)
  }

  return (
    <section aria-label="Worktrees" className="mb-3">
      <div className="flex items-center pe-1">
        <h3 className="flex-1 px-2 pb-1 text-tn-comment">Worktrees</h3>
        <IconTool
          label="Prune worktrees whose folders are gone"
          onClick={() => void run('worktree-prune', undefined, 'Pruned')}>
          <Scissors />
        </IconTool>
        <IconTool label="Add a worktree" onClick={() => void add()}>
          <Plus />
        </IconTool>
      </div>
      {trees.map((tree) => {
        const tag = treeTag(tree)
        return (
          // The card hangs off the whole row, so it opens past the row's own buttons instead of over them.
          <CheckoutHover key={tree.path} card={<WorktreeCard tree={tree} />}>
            <div className="group flex h-7 items-center gap-2 rounded-sm ps-2 hover:bg-accent/60">
              {/* The row opens the checkout in its own window, as the page it is in was opened. */}
              <Button
                variant="nothing"
                size="none"
                type="button"
                aria-label={tree.current ? `${tree.path}, open here` : `Open ${tree.path}`}
                aria-disabled={tree.current || tree.prunable || undefined}
                onClick={() => !tree.current && !tree.prunable && void open(tree.path)}
                className="flex h-full min-w-0 flex-1 shrink cursor-pointer items-center justify-start gap-2 rounded-none text-start aria-disabled:cursor-default">
                <span className={`w-5 shrink-0 text-center ${tree.current ? 'text-tn-green' : 'text-tn-blue'}`}>
                  {'\uf401'}
                </span>
                {/* The path gives up its room first; the name truncates only once that is gone. */}
                <span className="min-w-0 truncate">{tree.branch ?? short(tree.head)}</span>
                {tag ? (
                  <Badge variant={TAG_TONE[tag]} size="sm" className="shrink-0 bg-transparent">
                    {tag}
                  </Badge>
                ) : null}
                <span className="min-w-0 flex-[1_1_0] truncate text-muted-foreground">{tree.path}</span>
              </Button>
              {!tree.current ? (
                <span className="hidden group-focus-within:flex group-hover:flex">
                  {neovim ? (
                    <IconTool
                      label={`Switch Neovim's tab to ${tree.path}`}
                      tip="Neovim :tcd here"
                      onClick={() =>
                        void api.tcd(tree.path).then(
                          () => toast.success(`Neovim now works in ${leaf(tree.path)}`, { description: tree.path }),
                          (error: Error) => toast.error('Could not switch Neovim', { description: error.message }),
                        )
                      }>
                      <FolderInput />
                    </IconTool>
                  ) : null}
                  {!tree.main && !tree.separate ? (
                    <IconTool
                      destructive
                      label={`Remove the worktree at ${tree.path}`}
                      onClick={() => void remove(tree)}>
                      <Trash2 />
                    </IconTool>
                  ) : null}
                </span>
              ) : null}
            </div>
          </CheckoutHover>
        )
      })}
    </section>
  )
}

export function Submodules() {
  const { queries } = useApp()
  const { run } = useGit()
  const open = useOpenRepo()
  const modules = useQuery(queries.git.submodules()).data ?? NO_MODULES
  const root = useQuery(queries.git.repo()).data?.root ?? ''

  if (!modules.length) return null
  return (
    <section aria-label="Submodules" className="mb-3">
      <div className="flex items-center pe-1">
        <h3 className="flex-1 px-2 pb-1 text-tn-comment">Submodules</h3>
        <IconTool
          label="Sync submodule urls from .gitmodules"
          onClick={() => void run('submodule-sync', undefined, 'Synced submodule urls')}>
          <RefreshCw />
        </IconTool>
        <IconTool
          label="Init and update every submodule"
          onClick={() => void run('submodule-update', { init: true }, 'Updated submodules')}>
          <FolderInput />
        </IconTool>
      </div>
      {modules.map((module) => {
        const moved = module.initialized && module.current !== module.recorded
        return (
          <div
            key={module.path}
            className="group flex h-7 items-center gap-2 rounded-sm ps-2 hover:bg-accent/60"
            title={`${module.path}\n${module.url ?? ''}`}>
            <span className="w-5 shrink-0 text-center text-tn-magenta">{'\uf414'}</span>
            <span className="min-w-0 flex-1 truncate">{module.path}</span>
            {!module.initialized ? <span className="pe-2 text-muted-foreground">not checked out</span> : null}
            {moved ? (
              <span className="pe-2 text-warning" title={`Recorded ${module.recorded}, checked out ${module.current}`}>
                {short(module.current)} not {short(module.recorded)}
              </span>
            ) : null}
            <span className="hidden group-focus-within:flex group-hover:flex">
              <IconTool
                label={`Update ${module.path} to the recorded commit`}
                onClick={() =>
                  void run('submodule-update', { path: module.path, init: true }, `Updated ${module.path}`)
                }>
                <RefreshCw />
              </IconTool>
              {module.initialized ? (
                <IconTool
                  label={`Open ${module.path} on its own page`}
                  onClick={() => void open(`${root}/${module.path}`)}>
                  <SquareArrowOutUpRight />
                </IconTool>
              ) : null}
            </span>
          </div>
        )
      })}
    </section>
  )
}
