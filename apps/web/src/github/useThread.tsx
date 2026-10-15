import type { Thread } from '@duck-diff/protocol'
import { Pencil } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { IconTool } from '../app/IconTool'
import { createStore } from '../lib/store'

// The conversation of one pull request or issue, plus a comment draft the timeline can quote into.
export function useThread(number: number) {
  const { api } = useApp()
  const [thread, setThread] = useState<Thread | null>(null)
  const draft = useMemo(() => createStore(''), [])
  // A quiet reload (from a poll) keeps the last good thread when GitHub cannot be reached for a moment.
  const reload = useCallback(
    (quiet = false) =>
      api.github.thread(number).then(setThread, (error: Error) => {
        if (!quiet) toast.error(`Could not read the conversation: ${error.message}`)
      }),
    [api, number],
  )
  useEffect(() => {
    setThread(null)
    void reload()
  }, [reload])
  return { thread, draft, reload }
}

export function EditableTitle({
  number,
  title,
  canEdit,
  onChanged,
}: {
  number: number
  title: string
  canEdit: boolean
  onChanged(): void
}) {
  const { api } = useApp()
  const rename = async () => {
    const values = await ask.prompt({
      title: 'Edit title',
      fields: [{ name: 'title', label: 'Title', initial: title }],
      action: 'Save',
    })
    if (!values || values.title === title) return
    try {
      await api.github.editThread(number, { title: values.title })
      onChanged()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  return (
    <h2 className="flex min-w-0 flex-1 items-start gap-1 text-foreground">
      <span className="min-w-0">
        {title} <span className="text-muted-foreground">#{number}</span>
      </span>
      {canEdit ? (
        <IconTool label="Edit title" onClick={() => void rename()}>
          <Pencil />
        </IconTool>
      ) : null}
    </h2>
  )
}
