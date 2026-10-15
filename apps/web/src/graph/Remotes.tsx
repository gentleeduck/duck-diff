import type { Remote } from '@duck-diff/protocol'
import { useQuery } from '@tanstack/react-query'
import { Download, Plus, Tags, Trash2 } from 'lucide-react'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { IconTool } from '../app/IconTool'
import { useGit } from '../git/GitProvider'

// The repo's remotes, reread whenever the refs change (a fetch, an add, a remove).
const NO_REMOTES: Remote[] = []
export function Remotes() {
  const { queries } = useApp()
  const { run } = useGit()
  const remotes = useQuery(queries.git.remotes()).data ?? NO_REMOTES

  const add = async () => {
    const values = await ask.prompt({
      title: 'Add a remote',
      fields: [
        { name: 'name', label: 'Name', placeholder: 'upstream' },
        { name: 'url', label: 'URL', placeholder: 'git@github.com:owner/repo.git' },
      ],
      action: 'Add remote',
    })
    if (values && (await run('remote-add', values, `Added ${values.name}`))) {
      await run('fetch-remote', { remote: values.name, prune: false }, `Fetched ${values.name}`)
    }
  }
  const remove = async (name: string) => {
    const yes = await ask.confirm({
      title: `Remove ${name}`,
      body: 'Forgets the remote and its remote branches here. Nothing on the server changes.',
      action: 'Remove',
      destructive: true,
    })
    if (yes) await run('remote-remove', { name }, `Removed ${name}`)
  }

  return (
    <section aria-label="Remotes" className="mb-3">
      <div className="flex items-center pe-1">
        <h3 className="flex-1 px-2 pb-1 text-tn-comment">Remotes</h3>
        <IconTool
          label="Push every tag to origin"
          onClick={() => void run('tag-push', { remote: 'origin', name: null }, 'Pushed every tag')}>
          <Tags />
        </IconTool>
        <IconTool label="Add a remote" onClick={() => void add()}>
          <Plus />
        </IconTool>
      </div>
      {remotes.map((remote) => (
        <div
          key={remote.name}
          className="group flex h-7 items-center gap-2 rounded-sm ps-2 hover:bg-accent/60"
          title={remote.url}>
          <span className="w-5 shrink-0 text-center text-tn-blue">{''}</span>
          <span className="shrink-0">{remote.name}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{remote.url}</span>
          <span className="hidden group-focus-within:flex group-hover:flex">
            <IconTool
              label={`Fetch ${remote.name} and prune`}
              tip="Fetch, dropping branches deleted there"
              onClick={() => void run('fetch-remote', { remote: remote.name, prune: true }, `Fetched ${remote.name}`)}>
              <Download />
            </IconTool>
            <IconTool label={`Remove ${remote.name}`} onClick={() => void remove(remote.name)}>
              <Trash2 />
            </IconTool>
          </span>
        </div>
      ))}
    </section>
  )
}
