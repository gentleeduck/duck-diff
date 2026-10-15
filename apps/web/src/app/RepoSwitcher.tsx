import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@duck-diff/ui'
import { Check, FolderGit2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { RepoEntry } from '../lib/api'
import { useApp } from './AppProvider'

// Every repository opened before, one page each: picking one opens it in its own tab, served by a server
// this one starts, so each keeps its own history and saved lists.
export function RepoSwitcher() {
  const { api } = useApp()
  const [open, setOpen] = useState(false)
  const [repos, setRepos] = useState<RepoEntry[]>([])
  const [path, setPath] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (open) api.repos().then(setRepos, () => setRepos([]))
  }, [api, open])

  const go = async (target: string) => {
    const tab = window.open('about:blank', '_blank')
    try {
      const url = await api.openRepo(target)
      if (tab) tab.location.href = url
      setOpen(false)
    } catch (error) {
      tab?.close()
      toast.error(`Could not open ${target}: ${(error as Error).message}`)
    }
  }
  const add = async () => {
    if (!path.trim()) return
    setAdding(true)
    try {
      await api.addRepo(path.trim())
      setPath('')
      setRepos(await api.repos())
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setAdding(false)
    }
  }
  const forget = async (target: string) => {
    await api.removeRepo(target).catch(() => {})
    setRepos(await api.repos())
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="Repositories" className="mt-auto">
              <FolderGit2 />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Repositories</TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="end" className="flex w-96 flex-col gap-2 p-2">
        <ul aria-label="Repositories" className="flex max-h-80 flex-col overflow-y-auto">
          {repos.map((repo) => (
            <li key={repo.path} className="group flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="min-w-0 flex-1 justify-start gap-2"
                title={repo.path}
                disabled={repo.current}
                onClick={() => void go(repo.path)}>
                {repo.current ? <Check className="text-tn-green" /> : <FolderGit2 />}
                <span className="shrink-0">{repo.name}</span>
                <span className="min-w-0 truncate text-muted-foreground">{repo.path}</span>
              </Button>
              {!repo.current ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Forget ${repo.path}`}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => void forget(repo.path)}>
                  <X />
                </Button>
              ) : null}
            </li>
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
