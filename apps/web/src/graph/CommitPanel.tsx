import { Button, Separator } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, FileDiff, X } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { LinesSkeleton } from '../app/skeletons'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { fileGlyph, STATUS_MARK } from '../sidebar/icons'
import { relativeTime } from '../sidebar/relative-time'
import { CommitActions } from './CommitActions'

export function CommitPanel({ sha, onClose }: { sha: string; onClose(): void }) {
  const { graphSelection, diffFile, queries } = useApp()
  const { navigate } = useTarget()
  const { show } = useView()
  const details = useQuery(queries.git.commit(sha))
  const files = useQuery(queries.git.commitFiles(sha))
  const loaded = details.data && files.data ? { details: details.data, files: files.data } : null
  const failed = (details.error ?? files.error)?.message ?? null
  const [copied, setCopied] = useState(false)

  // The whole commit opens, scrolled to the file clicked, so it reads with the rest of what the commit did.
  const openChanges = (path?: string) => {
    navigate({ kind: 'commit', sha })
    show('changes')
    if (path) diffFile.set(path)
  }
  const copy = async () => {
    await navigator.clipboard.writeText(sha)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const [subject = '', ...body] = loaded?.details.message.split('\n') ?? []
  return (
    <aside aria-label="Commit" className="flex h-full flex-col bg-card">
      <header className="flex h-11 shrink-0 items-center gap-2 border-border border-b px-3">
        <span className="text-tn-comment">{sha.slice(0, 10)}</span>
        <IconTool label="Copy commit sha" tip={copied ? 'Copied' : 'Copy sha'} onClick={copy}>
          {copied ? <Check /> : <Copy />}
        </IconTool>
        <Button size="sm" variant="outline" className="ms-auto" onClick={() => openChanges()}>
          <FileDiff />
          Show changes
        </Button>
        <Button size="icon" variant="ghost" aria-label="Close commit" onClick={onClose}>
          <X />
        </Button>
      </header>
      {failed ? <p className="p-3 text-removed">Could not read this commit: {failed}</p> : null}
      {!loaded && !failed ? <LinesSkeleton count={8} /> : null}
      {loaded ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <h2 className="text-foreground">{subject}</h2>
          {body.join('\n').trim() ? (
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{body.join('\n').trim()}</p>
          ) : null}
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
            <dt>Author</dt>
            <dd className="text-foreground">
              {loaded.details.authorName} <span className="text-muted-foreground">{loaded.details.authorEmail}</span>
            </dd>
            <dt>Date</dt>
            <dd className="text-foreground">
              {new Date(loaded.details.authoredAt * 1000).toLocaleString()} ({relativeTime(loaded.details.authoredAt)})
            </dd>
            {loaded.details.committerName !== loaded.details.authorName ? (
              <>
                <dt>Committer</dt>
                <dd className="text-foreground">{loaded.details.committerName}</dd>
              </>
            ) : null}
            <dt>{loaded.details.parents.length > 1 ? 'Parents' : 'Parent'}</dt>
            <dd className="flex flex-wrap gap-1">
              {loaded.details.parents.length === 0 ? <span>none, first commit</span> : null}
              {loaded.details.parents.map((parent) => (
                <Button
                  key={parent}
                  size="sm"
                  variant="link"
                  className="h-auto p-0 text-tn-blue"
                  onClick={() => graphSelection.set(parent)}>
                  {parent.slice(0, 7)}
                </Button>
              ))}
            </dd>
          </dl>
          <div className="mt-3">
            <CommitActions sha={sha} />
          </div>
          <Separator className="my-3" />
          <h3 className="mb-1 text-muted-foreground">
            {loaded.files.length} {loaded.files.length === 1 ? 'file' : 'files'} changed
          </h3>
          <ul>
            {loaded.files.map((file) => {
              const icon = fileGlyph(file.path.split('/').pop() ?? file.path)
              const status = STATUS_MARK[file.status]
              return (
                <li key={file.path}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    title={`${file.path} (${status.title})`}
                    onClick={() => openChanges(file.path)}>
                    <span style={{ color: icon.color }}>{icon.glyph}</span>
                    <span style={{ color: status.color }}>{status.glyph}</span>
                    <span className="min-w-0 flex-1 truncate text-start">{file.path}</span>
                    {file.additions !== null ? <span className="text-added">+{file.additions}</span> : null}
                    {file.deletions !== null ? <span className="text-removed">-{file.deletions}</span> : null}
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </aside>
  )
}
