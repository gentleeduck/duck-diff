import type { Submodule, Worktree } from '@duck-diff/protocol'
import { ExternalLink, FolderInput, Plus, RefreshCw, Scissors, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { IconTool } from '../app/IconTool'
import { useGit } from '../git/GitProvider'
import { useCanOpen } from '../hooks/useCanOpen'
import { useRefs } from '../hooks/useRefs'

const short = (sha: string | null) => (sha ? sha.slice(0, 7) : 'none')
const leaf = (path: string) => path.split('/').filter(Boolean).pop() ?? path

// Another checkout opens in its own tab, served by a server started for it.
function useOpenRepo() {
  const { api } = useApp()
  return async (path: string) => {
    // Opened before the request so the browser treats it as the click's own tab.
    const tab = window.open('about:blank', '_blank')
    try {
      const url = await api.openRepo(path)
      if (tab) tab.location.href = url
      else window.open(url, '_blank')
    } catch (error) {
      tab?.close()
      toast.error(`Could not open ${path}: ${(error as Error).message}`)
    }
  }
}

export function Worktrees() {
  const { api } = useApp()
  const { run } = useGit()
  const { refs } = useRefs()
  const canOpen = useCanOpen()
  const open = useOpenRepo()
  const [trees, setTrees] = useState<Worktree[]>([])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refs only signal that something changed
  useEffect(() => {
    api.worktrees().then(setTrees, () => setTrees([]))
  }, [api, refs])

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
      title: `Remove the worktree at ${leaf(tree.path)}`,
      body: 'Deletes the folder. Its branch and commits stay. Uncommitted changes there stop the removal.',
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
      {trees.map((tree) => (
        <div
          key={tree.path}
          className="group flex h-7 items-center gap-2 rounded-sm ps-2 hover:bg-accent/60"
          title={tree.path}>
          <span className={`w-5 shrink-0 text-center ${tree.current ? 'text-tn-green' : 'text-tn-blue'}`}>
            {'\uf401'}
          </span>
          <span className="shrink-0">{tree.branch ?? short(tree.head)}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{tree.path}</span>
          {tree.current ? <span className="pe-2 text-tn-green">here</span> : null}
          {tree.prunable ? <span className="pe-2 text-warning">missing</span> : null}
          {!tree.current ? (
            <span className="hidden group-focus-within:flex group-hover:flex">
              <IconTool label={`Open ${tree.path} in a new tab`} onClick={() => void open(tree.path)}>
                <ExternalLink />
              </IconTool>
              {canOpen ? (
                <IconTool
                  label={`Switch Neovim's tab to ${tree.path}`}
                  tip="Neovim :tcd here"
                  onClick={() => void api.tcd(tree.path).then(() => toast(`Neovim now works in ${leaf(tree.path)}`))}>
                  <FolderInput />
                </IconTool>
              ) : null}
              {!tree.main ? (
                <IconTool label={`Remove the worktree at ${tree.path}`} onClick={() => void remove(tree)}>
                  <Trash2 />
                </IconTool>
              ) : null}
            </span>
          ) : null}
        </div>
      ))}
    </section>
  )
}

export function Submodules() {
  const { api } = useApp()
  const { run, status } = useGit()
  const open = useOpenRepo()
  const [modules, setModules] = useState<Submodule[]>([])
  const [root, setRoot] = useState('')

  // biome-ignore lint/correctness/useExhaustiveDependencies: status only signals that something changed
  useEffect(() => {
    api.submodules().then(setModules, () => setModules([]))
  }, [api, status])
  useEffect(() => {
    api.repo().then(
      (info) => setRoot(info.root),
      () => {},
    )
  }, [api])

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
                  label={`Open ${module.path} in a new tab`}
                  onClick={() => void open(`${root}/${module.path}`)}>
                  <ExternalLink />
                </IconTool>
              ) : null}
            </span>
          </div>
        )
      })}
    </section>
  )
}
