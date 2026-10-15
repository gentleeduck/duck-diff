import type { Thread } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { createStore } from '../lib/store'

// The conversation of one pull request or issue, plus a comment draft the timeline can quote into.
export function useThread(number: number, kind: 'pr' | 'issue') {
  const { api } = useApp()
  const [thread, setThread] = useState<Thread | null>(null)
  const draft = useMemo(() => createStore(''), [])
  // A quiet reload (from a poll) keeps the last good thread when GitHub cannot be reached for a moment.
  const reload = useCallback(
    (quiet = false) =>
      api.github.thread(number, kind).then(setThread, (error: Error) => {
        if (!quiet) toast.error(`Could not read the conversation: ${error.message}`)
      }),
    [api, number, kind],
  )
  useEffect(() => {
    setThread(null)
    void reload()
  }, [reload])
  return { thread, draft, reload }
}

// The item's title as GitHub shows it: large, with its number after it.
export function ThreadTitle({ number, title }: { number: number; title: string }) {
  return (
    <h2 className="min-w-0 flex-1 font-normal text-[1.75em] text-foreground leading-tight">
      {title} <span className="text-muted-foreground">#{number}</span>
    </h2>
  )
}

// GitHub's Edit button beside the title; only shown to people who may change it.
export function EditTitleButton({ number, title, onChanged }: { number: number; title: string; onChanged(): void }) {
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
    <Button size="sm" variant="outline" onClick={() => void rename()}>
      Edit
    </Button>
  )
}
