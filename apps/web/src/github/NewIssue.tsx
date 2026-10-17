import type { FormField, IssueTemplate } from '@duck-diff/protocol'
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@duck-diff/ui'
import { ArrowLeft, FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { LinesSkeleton } from '../app/skeletons'
import { VISIBLE_BOX } from '../viewer/FileActions'
import { MarkdownEditor } from './MarkdownEditor'

type Values = Record<string, string>

// An issue form's answers as the Markdown GitHub writes: one heading per field.
export function formBody(form: FormField[], values: Values): string {
  return form
    .filter((field) => field.type !== 'markdown')
    .map((field) => {
      const value = values[field.id] ?? ''
      if (field.type === 'checkboxes') {
        const ticked = new Set(value.split('\n').filter(Boolean))
        return `### ${field.label}\n\n${field.options.map((option) => `- [${ticked.has(option) ? 'x' : ' '}] ${option}`).join('\n')}`
      }
      return `### ${field.label}\n\n${value.trim() || '_No response_'}`
    })
    .join('\n\n')
}

function Field({ field, value, onChange }: { field: FormField; value: string; onChange(next: string): void }) {
  if (field.type === 'markdown') return <p className="whitespace-pre-wrap text-muted-foreground">{field.value}</p>
  const id = `form-${field.id}`
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>
        {field.label}
        {field.required ? <span className="text-removed"> *</span> : null}
      </Label>
      {field.description ? <p className="text-muted-foreground">{field.description}</p> : null}
      {field.type === 'input' ? (
        <Input
          id={id}
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
      {field.type === 'textarea' ? (
        <Textarea
          id={id}
          rows={5}
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
      {field.type === 'dropdown' ? (
        <Select value={value} onValueChange={(next: string) => next && onChange(next)}>
          <SelectTrigger id={id} aria-label={field.label} className="h-7 w-full">
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {field.type === 'checkboxes'
        ? field.options.map((option) => {
            const ticked = new Set(value.split('\n').filter(Boolean))
            return (
              <div key={option} className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-${option}`}
                  checked={ticked.has(option)}
                  className={VISIBLE_BOX}
                  onCheckedChange={(next) => {
                    if (next === true) ticked.add(option)
                    else ticked.delete(option)
                    onChange([...ticked].join('\n'))
                  }}
                />
                <Label htmlFor={`${id}-${option}`}>{option}</Label>
              </div>
            )
          })
        : null}
    </div>
  )
}

// GitHub's "New issue": choose a template (or a blank issue), then fill it in.
export function NewIssue({ onCreated }: { onCreated(): void }) {
  const { api, issueSelection, queries, queryClient } = useApp()
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<IssueTemplate[] | null>(null)
  const [chosen, setChosen] = useState<IssueTemplate | 'blank' | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [values, setValues] = useState<Values>({})
  const [sending, setSending] = useState(false)

  const start = () => {
    setOpen(true)
    setChosen(null)
    queryClient.fetchQuery(queries.gh.templates()).then(
      (found) => {
        setTemplates(found.issue)
        if (!found.issue.length) pick('blank')
      },
      () => pick('blank'),
    )
  }
  const pick = (template: IssueTemplate | 'blank') => {
    setChosen(template)
    setTitle(template === 'blank' ? '' : template.title)
    setBody(template === 'blank' ? '' : (template.body ?? ''))
    setValues(
      template === 'blank'
        ? {}
        : Object.fromEntries(
            template.form.filter((field) => field.type !== 'markdown').map((field) => [field.id, field.value]),
          ),
    )
  }

  const template = chosen && chosen !== 'blank' ? chosen : null
  const missing = template?.form.some((field) => field.required && !(values[field.id] ?? '').trim())
  const create = async () => {
    setSending(true)
    try {
      const issue = await api.github.createIssue({
        title: title.trim(),
        body: template && template.body === null ? formBody(template.form, values) : body,
        labels: template?.labels ?? [],
        assignees: template?.assignees ?? [],
      })
      toast.success(`Opened #${issue.number}`, { description: issue.title })
      setOpen(false)
      onCreated()
      issueSelection.set(issue.number)
    } catch (error) {
      toast.error('Could not open the issue', { description: (error as Error).message })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* GitHub's create buttons are green. */}
      <Button size="sm" className="bg-tn-green text-background hover:bg-tn-green/85" onClick={start}>
        <Plus />
        New issue
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogTitle>{template ? template.name : 'New issue'}</DialogTitle>
          {chosen === null ? (
            <ul className="flex flex-col gap-2">
              {templates === null ? <LinesSkeleton count={3} className="" /> : null}
              {templates?.map((entry) => (
                <li key={entry.file} className="flex items-center gap-3 rounded-md border border-border p-3">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-foreground">{entry.name}</span>
                    <span className="text-muted-foreground">{entry.about}</span>
                  </span>
                  <Button size="sm" onClick={() => pick(entry)}>
                    Get started
                  </Button>
                </li>
              ))}
              {templates ? (
                <li className="flex items-center gap-3 rounded-md border border-border border-dashed p-3">
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    Don't see your issue here? Open a blank one.
                  </span>
                  <Button size="sm" variant="outline" onClick={() => pick('blank')}>
                    Blank issue
                  </Button>
                </li>
              ) : null}
            </ul>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (title.trim() && !missing) void create()
              }}>
              {templates?.length ? (
                <Button
                  variant="nothing"
                  size="none"
                  type="button"
                  onClick={() => setChosen(null)}
                  className="flex w-fit cursor-pointer items-center gap-1 text-tn-blue hover:underline justify-start rounded-none whitespace-normal">
                  <ArrowLeft className="size-4" />
                  Choose a different template
                </Button>
              ) : null}
              <Input
                aria-label="Title"
                placeholder="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              {template && template.body === null ? (
                template.form.map((field) => (
                  <Field
                    key={field.id}
                    field={field}
                    value={values[field.id] ?? ''}
                    onChange={(next) => setValues((prev) => ({ ...prev, [field.id]: next }))}
                  />
                ))
              ) : (
                <MarkdownEditor label="Description" value={body} onChange={setBody} rows={10} />
              )}
              {template && (template.labels.length || template.assignees.length) ? (
                <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
                  Will be opened with
                  {template.labels.map((label) => (
                    <Badge key={label} variant="muted" size="sm">
                      {label}
                    </Badge>
                  ))}
                  {template.assignees.map((login) => (
                    <Badge key={login} variant="soft-info" size="sm">
                      @{login}
                    </Badge>
                  ))}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!title.trim() || missing} loading={sending}>
                  Open issue
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
