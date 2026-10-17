import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Textarea,
} from '@duck-diff/ui'
import { useState } from 'react'
import { createStore, useStore } from '../lib/store'

export interface Field {
  name: string
  label: string
  placeholder?: string
  initial?: string
  multiline?: boolean
  optional?: boolean
}

interface Question {
  title: string
  body?: string
  detail?: string
  fields: Field[]
  action: string
  destructive?: boolean
  resolve(values: Record<string, string> | null): void
}

const question = createStore<Question | null>(null)

// One dialog for the whole page: confirm a risky action or ask for a few names. Resolves null on cancel.
export const ask = {
  confirm(options: {
    title: string
    body?: string
    detail?: string
    action: string
    destructive?: boolean
  }): Promise<boolean> {
    return new Promise((resolve) =>
      question.set({ ...options, fields: [], resolve: (values) => resolve(values !== null) }),
    )
  },
  prompt(options: {
    title: string
    body?: string
    fields: Field[]
    action: string
  }): Promise<Record<string, string> | null> {
    return new Promise((resolve) => question.set({ ...options, resolve }))
  },
}

const selectQuestion = (value: Question | null) => value

function Form({ current }: { current: Question }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(current.fields.map((field) => [field.name, field.initial ?? ''])),
  )
  const ready = current.fields.every((field) => field.optional || (values[field.name] ?? '').trim())
  const close = (result: Record<string, string> | null) => {
    question.set(null)
    current.resolve(result)
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) close(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])))
      }}>
      <DialogTitle className="pe-6">{current.title}</DialogTitle>
      {current.body ? <DialogDescription>{current.body}</DialogDescription> : null}
      {/* What it acts on, often a path: no spaces to wrap at, so it gets a line of its own and breaks anywhere. */}
      {current.detail ? (
        <p className="break-all rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-foreground">
          {current.detail}
        </p>
      ) : null}
      {current.fields.map((field, i) => {
        const Control = field.multiline ? Textarea : Input
        return (
          <div key={field.name} className="flex flex-col gap-1">
            <label htmlFor={`ask-${field.name}`} className="text-muted-foreground">
              {field.label}
            </label>
            <Control
              id={`ask-${field.name}`}
              autoFocus={i === 0}
              aria-label={field.label}
              placeholder={field.placeholder}
              value={values[field.name] ?? ''}
              onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setValues((prev) => ({ ...prev, [field.name]: event.target.value }))
              }
            />
          </div>
        )
      })}
      <DialogFooter className="mt-1">
        <Button type="button" size="sm" variant="ghost" onClick={() => close(null)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant={current.destructive ? 'destructive' : 'default'} disabled={!ready}>
          {current.action}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function AskDialog() {
  const current = useStore(question, selectQuestion)
  return (
    <Dialog
      open={current !== null}
      onOpenChange={(open) => {
        if (open || !current) return
        question.set(null)
        current.resolve(null)
      }}>
      <DialogContent className="max-w-lg">
        {current ? <Form key={current.title} current={current} /> : null}
      </DialogContent>
    </Dialog>
  )
}
