import { Button } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { Check, RotateCcw } from 'lucide-react'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { IconTool } from '../app/IconTool'
import { useGit } from '../git/GitProvider'
import { fileGlyph } from '../sidebar/icons'

// Files resolved since git stopped, each with a way back to its conflict until the operation is continued.
// Git's merge tool hands one file at a time and stages it itself, so it gets no list.
export function ResolvedFiles({ compact = false }: { compact?: boolean }) {
  const { queries, toolId } = useApp()
  const { status, run, busy } = useGit()
  const active = Boolean(status?.operation) && !toolId
  const resolved = useQuery({ ...queries.git.resolved(), enabled: active })
  const paths = active ? (resolved.data ?? []) : []
  if (!paths.length) return null

  const reopen = async (path: string) => {
    const sure = await ask.confirm({
      title: 'Reopen this conflict?',
      body: 'The resolution is thrown away and the conflict comes back as git wrote it, to pick again.',
      detail: path,
      action: 'Reopen',
      destructive: true,
    })
    if (sure) await run('reopen-conflict', { path }, `Reopened ${path}`)
  }

  return (
    <section aria-label="Resolved" className={compact ? 'px-2 pb-2' : 'p-1'}>
      <p className="px-2 py-1 text-muted-foreground">Resolved</p>
      <ul aria-label="Resolved files" className="flex flex-col">
        {paths.map((path) => {
          const icon = fileGlyph(path.split('/').pop() ?? path)
          return (
            <li
              key={path}
              className={`flex ${compact ? 'h-7' : 'h-8'} items-center gap-2 rounded-sm px-2 hover:bg-accent/40`}>
              <Check className="size-4 shrink-0 text-tn-green" />
              <span style={{ color: icon.color }}>{icon.glyph}</span>
              <span className="min-w-0 flex-1 truncate" title={path}>
                {path}
              </span>
              {compact ? (
                <IconTool
                  label={`Reopen ${path}`}
                  tip="Reopen: back to the conflict as git wrote it"
                  disabled={busy !== null}
                  onClick={() => void reopen(path)}>
                  <RotateCcw />
                </IconTool>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Reopen ${path}`}
                  disabled={busy !== null}
                  onClick={() => void reopen(path)}>
                  <RotateCcw />
                  Reopen
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
